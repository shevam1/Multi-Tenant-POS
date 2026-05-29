import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { BookingStatus } from '@omnipos/db';
import { AuditService } from '../audit/audit.service';
import { CustomersService } from '../customers/customers.service';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import type { CreateBookingDto } from './dto/create-booking.dto';
import type { UpdateBookingStatusDto } from './dto/update-booking-status.dto';

/** Configurable threshold: bookings with ≥ this many no-shows require a deposit. */
const NO_SHOW_DEPOSIT_THRESHOLD = 2;
/** Default deposit amount when reliability threshold is exceeded (cents). */
const DEFAULT_DEPOSIT_CENTS = 5000;

/** Valid status transitions for the booking state machine. */
const VALID_TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
  PENDING: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['CHECKED_IN', 'CANCELLED', 'NO_SHOW', 'LATE'],
  CHECKED_IN: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['READY', 'COMPLETED'],
  READY: ['COMPLETED'],
  COMPLETED: [],
  CANCELLED: [],
  NO_SHOW: [],
  LATE: ['CHECKED_IN', 'CANCELLED'],
};

@Injectable()
export class BookingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly customers: CustomersService,
    private readonly audit: AuditService,
    private readonly realtime: RealtimeGateway,
  ) {}

  async listForStore(storeId: string, date?: string) {
    const where: Record<string, unknown> = { storeId };
    if (date) {
      const start = new Date(date);
      start.setHours(0, 0, 0, 0);
      const end = new Date(date);
      end.setHours(23, 59, 59, 999);
      where['scheduledStart'] = { gte: start, lte: end };
    }
    return this.prisma.db.booking.findMany({
      where,
      orderBy: { scheduledStart: 'asc' },
      include: {
        customer: true,
        pet: true,
        lineItems: true,
        workflow: { orderBy: { occurredAt: 'asc' } },
      },
    });
  }

  async findOne(id: string) {
    const b = await this.prisma.db.booking.findUnique({
      where: { id },
      include: {
        customer: true,
        pet: { include: { vaccinations: true } },
        lineItems: { include: { catalogItem: true } },
        workflow: { orderBy: { occurredAt: 'asc' } },
        consents: true,
        invoice: { include: { lines: true, taxLines: true, payments: true } },
      },
    });
    if (!b) throw new NotFoundException('Booking not found');
    return b;
  }

  async create(dto: CreateBookingDto, tenantId: string) {
    const reliability = await this.customers.reliabilitySummary(dto.customerId);
    const requiresDeposit = reliability.noShow >= NO_SHOW_DEPOSIT_THRESHOLD;

    const booking = await this.prisma.db.booking.create({
      data: {
        tenantId,
        storeId: dto.storeId,
        customerId: dto.customerId,
        petId: dto.petId,
        scheduledStart: new Date(dto.scheduledStart),
        scheduledEnd: dto.scheduledEnd ? new Date(dto.scheduledEnd) : undefined,
        assignedGroomerId: dto.assignedGroomerId,
        source: dto.source ?? 'POS',
        notes: dto.notes,
        depositRequiredCents: requiresDeposit ? DEFAULT_DEPOSIT_CENTS : 0,
        lineItems: dto.lineItemIds?.length
          ? {
              create: dto.lineItemIds.map((id) => ({
                tenantId,
                catalogItemId: id,
                description: '',
                quantity: 1,
                unitPriceCents: 0,
              })),
            }
          : undefined,
      },
      include: { customer: true, pet: true, lineItems: true },
    });

    await this.audit.log({ action: 'BOOKING_CREATE', entityType: 'booking', entityId: booking.id, metadata: { requiresDeposit, reliability } });
    // Notify admin in real time: new pending booking from the web
    this.realtime.emitNewBooking(tenantId, booking);
    return { ...booking, reliabilitySummary: reliability };
  }

  async updateStatus(id: string, dto: UpdateBookingStatusDto) {
    const booking = await this.prisma.db.booking.findUnique({ where: { id } });
    if (!booking) throw new NotFoundException('Booking not found');

    const allowed = VALID_TRANSITIONS[booking.status];
    if (!allowed.includes(dto.status)) {
      throw new BadRequestException(`Cannot transition ${booking.status} → ${dto.status}`);
    }

    const updated = await this.prisma.db.booking.update({
      where: { id },
      data: { status: dto.status, ...(dto.assignedGroomerId ? { assignedGroomerId: dto.assignedGroomerId } : {}) },
    });

    await this.audit.log({ action: 'BOOKING_STATUS', entityType: 'booking', entityId: id, metadata: { from: booking.status, to: dto.status } });
    this.realtime.emitBookingStatusChange(booking.storeId, { bookingId: id, status: dto.status });
    return updated;
  }

  /** Approve a pending booking (manager/reception action). */
  async approve(id: string) {
    return this.updateStatus(id, { status: 'CONFIRMED' });
  }

  /** Advance the grooming workflow by one stage and timestamp it. */
  async advanceWorkflow(bookingId: string, stage: string, actorUserId?: string) {
    const booking = await this.prisma.db.booking.findUnique({ where: { id: bookingId } });
    if (!booking) throw new NotFoundException('Booking not found');

    const event = await this.prisma.db.workflowEvent.create({
      data: { tenantId: booking.tenantId, bookingId, stage: stage as Parameters<typeof this.prisma.db.workflowEvent.create>[0]['data']['stage'], actorUserId },
    });
    if (stage === 'READY') {
      await this.prisma.db.booking.update({ where: { id: bookingId }, data: { status: 'READY' } });
    } else if (stage === 'CHECK_IN') {
      await this.prisma.db.booking.update({ where: { id: bookingId }, data: { status: 'CHECKED_IN' } });
    }
    this.realtime.emitQueueUpdate(booking.storeId, { bookingId, stage, occurredAt: event.occurredAt });
    return event;
  }

  async submitConsent(bookingId: string, formType: string, signature: string, payload: object, tenantId: string) {
    return this.prisma.db.consentSubmission.create({
      data: { tenantId, bookingId, formType, signature, signedAt: new Date(), payload },
    });
  }
}
