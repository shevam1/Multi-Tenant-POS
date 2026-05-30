import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { BookingStatus } from '@omnipos/db';
import { AuditService } from '../audit/audit.service';
import { CustomersService } from '../customers/customers.service';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { VaccinationsService } from '../vaccinations/vaccinations.service';
import { FormsService } from '../forms/forms.service';
import { StripeService } from '../stripe/stripe.service';
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
    private readonly vaccinations: VaccinationsService,
    private readonly forms: FormsService,
    private readonly stripe: StripeService,
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
        store: true,
        customer: true,
        pet: { include: { vaccinations: true } },
        lineItems: { include: { catalogItem: true } },
        workflow: { orderBy: { occurredAt: 'asc' } },
        consents: true,
        invoice: { include: { lines: true, taxLines: true, payments: true } },
        groomers: { include: { user: { select: { id: true, fullName: true } } } },
        extraPets: { include: { pet: { select: { id: true, name: true, breed: true } } } },
        photos: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!b) throw new NotFoundException('Booking not found');
    return b;
  }

  async create(dto: CreateBookingDto, tenantId: string) {
    const reliability = await this.customers.reliabilitySummary(dto.customerId);
    const requiresDeposit = reliability.noShow >= NO_SHOW_DEPOSIT_THRESHOLD;

    // Spec §3: check for expired vaccinations when a pet is attached.
    // If the store has blocking enabled, throw; otherwise surface a warning.
    let vaccinationWarning: string | undefined;
    if (dto.petId) {
      const hasExpired = await this.vaccinations.hasExpiredVaccinations(dto.petId);
      if (hasExpired) {
        if (dto.blockIfExpiredVaccinations) {
          throw new BadRequestException(
            'Booking blocked: this pet has expired vaccinations. Please renew before booking.',
          );
        }
        vaccinationWarning = 'This pet has one or more expired vaccinations. Please renew before the appointment.';
      }
    }

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

    await this.audit.log({ action: 'BOOKING_CREATE', entityType: 'booking', entityId: booking.id, metadata: { requiresDeposit, reliability, vaccinationWarning } });
    this.realtime.emitNewBooking(tenantId, booking);
    return { ...booking, reliabilitySummary: reliability, vaccinationWarning };
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

  /**
   * Approve a pending booking (manager/reception action).
   * Spec §6: a booking cannot move PENDING → CONFIRMED until all mandatory
   * consent forms are signed, unless a manager explicitly overrides.
   */
  async approve(id: string, override = false) {
    const booking = await this.prisma.db.booking.findUnique({ where: { id } });
    if (!booking) throw new NotFoundException('Booking not found');

    if (!override) {
      const unsigned = await this.forms.unsignedMandatoryForms(id, booking.tenantId);
      if (unsigned.length > 0) {
        throw new BadRequestException(
          `Cannot confirm: mandatory consent forms not signed (${unsigned.join(', ')}). ` +
          `Send the signing link or override.`,
        );
      }
    }
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

  /**
   * Mark a booking as NO_SHOW.
   * If feeCents > 0 AND the customer has a card on file, charge the fee via Stripe.
   * If feeCents > 0 AND no card → deduct from statement credit (minimum $0).
   */
  async markNoShow(id: string, feeCents = 0) {
    const booking = await this.prisma.db.booking.findUnique({
      where: { id },
      include: { customer: true, store: { select: { name: true } } },
    });
    if (!booking) throw new NotFoundException('Booking not found');

    await this.updateStatus(id, { status: 'NO_SHOW' });

    const result: Record<string, unknown> = { bookingId: id, status: 'NO_SHOW', feeCents };

    if (feeCents > 0) {
      if (booking.customer.stripeCustomerId) {
        // Charge card on file
        const pi = await this.stripe.createPaymentIntent({
          amountCents: feeCents,
          currency: 'cad',
          stripeCustomerId: booking.customer.stripeCustomerId,
          metadata: { bookingId: id, reason: 'no_show_fee' },
        });
        result.stripeCharge = pi?.id ?? null;
        result.chargeMethod = 'card';
      } else if (booking.customer.statementCreditCents >= feeCents) {
        await this.prisma.db.customer.update({
          where: { id: booking.customerId },
          data: { statementCreditCents: { decrement: feeCents } },
        });
        result.chargeMethod = 'credit';
      } else {
        result.chargeMethod = 'none';
        result.note = 'No card or insufficient credit — fee not collected';
      }
    }

    await this.audit.log({ action: 'BOOKING_NO_SHOW', entityType: 'booking', entityId: id, metadata: result });
    return result;
  }

  /**
   * Cancel a booking with an optional cancellation fee.
   */
  async cancelBooking(id: string, reason?: string, feeCents = 0) {
    const booking = await this.prisma.db.booking.findUnique({
      where: { id }, include: { customer: true },
    });
    if (!booking) throw new NotFoundException('Booking not found');

    await this.updateStatus(id, { status: 'CANCELLED' });

    const result: Record<string, unknown> = { bookingId: id, status: 'CANCELLED', reason, feeCents };

    if (feeCents > 0 && booking.customer.stripeCustomerId) {
      const pi = await this.stripe.createPaymentIntent({
        amountCents: feeCents,
        currency: 'cad',
        stripeCustomerId: booking.customer.stripeCustomerId,
        metadata: { bookingId: id, reason: 'cancellation_fee' },
      });
      result.stripeCharge = pi?.id ?? null;
    }

    await this.audit.log({ action: 'BOOKING_CANCEL', entityType: 'booking', entityId: id, metadata: result });
    return result;
  }

  /**
   * Force-close an unclosed booking (CHECKED_IN / IN_PROGRESS / READY → COMPLETED).
   */
  async closeBooking(id: string) {
    await this.updateStatus(id, { status: 'COMPLETED' });
    await this.audit.log({ action: 'BOOKING_FORCE_CLOSE', entityType: 'booking', entityId: id });
    return { bookingId: id, status: 'COMPLETED' };
  }

  // ── Calendar ────────────────────────────────────────────────────────────────

  /** All bookings for a store in a week window — for the calendar board. */
  async calendarForStore(storeId: string, weekStart: string) {
    const start = new Date(weekStart + 'T00:00:00');
    const end = new Date(start);
    end.setDate(end.getDate() + 7);

    return this.prisma.db.booking.findMany({
      where: { storeId, scheduledStart: { gte: start, lt: end }, status: { not: 'CANCELLED' } },
      orderBy: { scheduledStart: 'asc' },
      select: {
        id: true, status: true, scheduledStart: true, scheduledEnd: true,
        assignedGroomerId: true, flags: true, notes: true, source: true,
        customer: { select: { id: true, fullName: true } },
        pet: { select: { id: true, name: true, breed: true } },
        lineItems: { select: { description: true, unitPriceCents: true } },
      },
    });
  }

  /**
   * Reschedule / reassign a booking (drag-and-drop on the calendar).
   * Guards against double-booking the same groomer in an overlapping window.
   */
  async reschedule(id: string, dto: { scheduledStart?: string; scheduledEnd?: string | null; assignedGroomerId?: string | null }) {
    const booking = await this.prisma.db.booking.findUnique({ where: { id } });
    if (!booking) throw new NotFoundException('Booking not found');

    const newStart = dto.scheduledStart ? new Date(dto.scheduledStart) : booking.scheduledStart;
    const newEnd = dto.scheduledEnd !== undefined
      ? (dto.scheduledEnd ? new Date(dto.scheduledEnd) : null)
      : booking.scheduledEnd;
    const groomerId = dto.assignedGroomerId !== undefined ? dto.assignedGroomerId : booking.assignedGroomerId;

    // Overlap guard for the assigned groomer
    if (groomerId && newEnd) {
      const clash = await this.prisma.db.booking.findFirst({
        where: {
          id: { not: id }, storeId: booking.storeId, assignedGroomerId: groomerId,
          status: { notIn: ['CANCELLED', 'NO_SHOW', 'COMPLETED'] },
          scheduledStart: { lt: newEnd },
          scheduledEnd: { gt: newStart },
        },
      });
      if (clash) throw new BadRequestException('That groomer already has an appointment in this time slot');
    }

    const updated = await this.prisma.db.booking.update({
      where: { id },
      data: { scheduledStart: newStart, scheduledEnd: newEnd, assignedGroomerId: groomerId },
    });
    await this.audit.log({ action: 'BOOKING_RESCHEDULE', entityType: 'booking', entityId: id,
      metadata: { scheduledStart: newStart, assignedGroomerId: groomerId } });
    this.realtime.emitBookingStatusChange(booking.storeId, { bookingId: id, rescheduled: true });
    return updated;
  }

  /** Set the status color tags on a booking. */
  async setFlags(id: string, flags: string[]) {
    const updated = await this.prisma.db.booking.update({ where: { id }, data: { flags } });
    await this.audit.log({ action: 'BOOKING_FLAGS', entityType: 'booking', entityId: id, metadata: { flags } });
    return updated;
  }

  /** Toggle confirmed (CONFIRMED) ↔ unconfirmed (PENDING). */
  async setConfirmed(id: string, confirmed: boolean, override = false) {
    if (confirmed) return this.approve(id, override);
    const updated = await this.prisma.db.booking.update({ where: { id }, data: { status: 'PENDING' } });
    await this.audit.log({ action: 'BOOKING_UNCONFIRM', entityType: 'booking', entityId: id });
    return updated;
  }

  // ── Scheduling intelligence ──────────────────────────────────────────────

  /** Default store operating window (used when no shifts are defined). */
  private static readonly OPEN_H = 8;
  private static readonly CLOSE_H = 19;
  private static readonly SLOT_MIN = 60;

  /**
   * Available appointment slots for a store on a date.
   * A slot is available if at least one groomer is free:
   *   capacity(slot) = (# groomers on shift covering slot, or all groomers if no
   *   shifts defined) − (# CONFIRMED/active bookings overlapping the slot).
   * Only confirmed bookings consume capacity — pending web requests don't block.
   */
  async availability(storeId: string, date: string, tenantId?: string) {
    const dayStart = new Date(date + 'T00:00:00');
    const dayEnd = new Date(date + 'T23:59:59');
    // Public (web) callers pass tenantId explicitly (no JWT/CLS); admin uses db getter.
    const db = tenantId ? this.prisma.forTenant(tenantId) : this.prisma.db;

    const [groomers, shifts, bookings] = await Promise.all([
      db.user.findMany({ where: { storeId, role: 'GROOMER', active: true }, select: { id: true } }),
      db.shiftSchedule.findMany({
        where: { storeId, status: { not: 'CANCELLED' }, startsAt: { lt: dayEnd }, endsAt: { gt: dayStart } },
        select: { userId: true, startsAt: true, endsAt: true },
      }),
      db.booking.findMany({
        where: { storeId, status: { in: ['CONFIRMED', 'CHECKED_IN', 'IN_PROGRESS'] }, scheduledStart: { gte: dayStart, lte: dayEnd } },
        select: { scheduledStart: true, scheduledEnd: true },
      }),
    ]);

    const totalGroomers = Math.max(1, groomers.length);
    const slots: { time: string; available: boolean; capacity: number }[] = [];

    for (let h = BookingsService.OPEN_H; h < BookingsService.CLOSE_H; h++) {
      const slotStart = new Date(date + 'T00:00:00');
      slotStart.setHours(h, 0, 0, 0);
      const slotEnd = new Date(slotStart.getTime() + BookingsService.SLOT_MIN * 60000);

      // Groomers on shift covering this slot (fallback: all groomers if no shifts that day)
      const onShift = shifts.length === 0
        ? totalGroomers
        : new Set(shifts.filter(s => s.startsAt < slotEnd && s.endsAt > slotStart).map(s => s.userId)).size;

      // Bookings overlapping this slot
      const booked = bookings.filter(b => {
        const bEnd = b.scheduledEnd ?? new Date(b.scheduledStart.getTime() + 60 * 60000);
        return b.scheduledStart < slotEnd && bEnd > slotStart;
      }).length;

      const capacity = Math.max(0, onShift - booked);
      slots.push({ time: slotStart.toISOString(), available: capacity > 0, capacity });
    }
    return { date, slots };
  }

  /**
   * Auto-schedule: assign the booking to the available groomer with the lightest
   * workload that day (load-balancing), who is free during the booking's window.
   */
  async autoSchedule(id: string) {
    const booking = await this.prisma.db.booking.findUnique({ where: { id } });
    if (!booking) throw new NotFoundException('Booking not found');

    const start = booking.scheduledStart;
    const end = booking.scheduledEnd ?? new Date(start.getTime() + 60 * 60000);
    const dayStart = new Date(start); dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(start); dayEnd.setHours(23, 59, 59, 999);

    const groomers = await this.prisma.db.user.findMany({
      where: { storeId: booking.storeId, role: 'GROOMER', active: true }, select: { id: true, fullName: true },
    });
    if (groomers.length === 0) throw new BadRequestException('No groomers at this store');

    // Day's bookings per groomer (for load balancing) + conflict check
    const dayBookings = await this.prisma.db.booking.findMany({
      where: { storeId: booking.storeId, id: { not: id }, status: { notIn: ['CANCELLED', 'NO_SHOW'] }, scheduledStart: { gte: dayStart, lte: dayEnd } },
      select: { assignedGroomerId: true, scheduledStart: true, scheduledEnd: true },
    });

    const loadByGroomer = new Map<string, number>();
    for (const g of groomers) loadByGroomer.set(g.id, 0);
    const busyAtSlot = new Set<string>();
    for (const b of dayBookings) {
      if (!b.assignedGroomerId) continue;
      const bEnd = b.scheduledEnd ?? new Date(b.scheduledStart.getTime() + 60 * 60000);
      const mins = (bEnd.getTime() - b.scheduledStart.getTime()) / 60000;
      loadByGroomer.set(b.assignedGroomerId, (loadByGroomer.get(b.assignedGroomerId) ?? 0) + mins);
      if (b.scheduledStart < end && bEnd > start) busyAtSlot.add(b.assignedGroomerId);
    }

    // Candidates: free during the window, sorted by least load
    const candidates = groomers
      .filter(g => !busyAtSlot.has(g.id))
      .sort((a, b) => (loadByGroomer.get(a.id) ?? 0) - (loadByGroomer.get(b.id) ?? 0));

    if (candidates.length === 0) throw new BadRequestException('No groomer is free in this time slot');

    const chosen = candidates[0];
    await this.prisma.db.booking.update({ where: { id }, data: { assignedGroomerId: chosen.id } });
    await this.audit.log({ action: 'BOOKING_AUTO_SCHEDULE', entityType: 'booking', entityId: id, metadata: { groomerId: chosen.id } });
    this.realtime.emitBookingStatusChange(booking.storeId, { bookingId: id, assignedGroomerId: chosen.id });
    return { assignedGroomerId: chosen.id, groomerName: chosen.fullName, loadMinutes: loadByGroomer.get(chosen.id) ?? 0 };
  }

  // ── Multi-groomer ──────────────────────────────────────────────────────────

  async addGroomer(bookingId: string, userId: string, role: string | undefined, tenantId: string) {
    const existing = await this.prisma.db.bookingGroomer.findFirst({ where: { bookingId, userId } });
    if (existing) return existing;
    const bg = await this.prisma.db.bookingGroomer.create({ data: { tenantId, bookingId, userId, role } });
    await this.audit.log({ action: 'BOOKING_ADD_GROOMER', entityType: 'booking', entityId: bookingId, metadata: { userId } });
    return bg;
  }

  async removeGroomer(bookingId: string, userId: string) {
    await this.prisma.db.bookingGroomer.deleteMany({ where: { bookingId, userId } });
    await this.audit.log({ action: 'BOOKING_REMOVE_GROOMER', entityType: 'booking', entityId: bookingId, metadata: { userId } });
    return { removed: true };
  }

  // ── Multi-pet ────────────────────────────────────────────────────────────

  async addPet(bookingId: string, petId: string, tenantId: string) {
    const existing = await this.prisma.db.bookingPet.findFirst({ where: { bookingId, petId } });
    if (existing) return existing;
    const bp = await this.prisma.db.bookingPet.create({ data: { tenantId, bookingId, petId } });
    await this.audit.log({ action: 'BOOKING_ADD_PET', entityType: 'booking', entityId: bookingId, metadata: { petId } });
    return bp;
  }

  async removePet(bookingId: string, petId: string) {
    await this.prisma.db.bookingPet.deleteMany({ where: { bookingId, petId } });
    await this.audit.log({ action: 'BOOKING_REMOVE_PET', entityType: 'booking', entityId: bookingId, metadata: { petId } });
    return { removed: true };
  }

  // ── Before/after photos ──────────────────────────────────────────────────

  async addPhoto(bookingId: string, kind: string, url: string, petId: string | undefined, uploadedBy: string, tenantId: string) {
    const photo = await this.prisma.db.bookingPhoto.create({
      data: { tenantId, bookingId, kind, url, petId, uploadedBy },
    });
    await this.audit.log({ action: 'BOOKING_PHOTO', entityType: 'booking', entityId: bookingId, metadata: { kind } });
    const booking = await this.prisma.db.booking.findUnique({ where: { id: bookingId }, select: { storeId: true } });
    if (booking) this.realtime.emitQueueUpdate(booking.storeId, { bookingId, photoAdded: kind });
    return photo;
  }

  async listPhotos(bookingId: string) {
    return this.prisma.db.bookingPhoto.findMany({ where: { bookingId }, orderBy: { createdAt: 'asc' } });
  }

  async deletePhoto(photoId: string) {
    await this.prisma.db.bookingPhoto.delete({ where: { id: photoId } });
    return { deleted: true };
  }

  /** Appointment audit trail — combines audit log + workflow events. */
  async appointmentAudit(id: string) {
    const booking = await this.prisma.db.booking.findUnique({ where: { id } });
    if (!booking) throw new NotFoundException('Booking not found');

    const [logs, workflow] = await Promise.all([
      this.prisma.asSystem(tx => tx.auditLog.findMany({
        where: { tenantId: booking.tenantId, entityType: 'booking', entityId: id },
        orderBy: { createdAt: 'desc' }, take: 50,
      })),
      this.prisma.db.workflowEvent.findMany({ where: { bookingId: id }, orderBy: { occurredAt: 'asc' } }),
    ]);

    return {
      created: { at: booking.createdAt, source: booking.source },
      logs: logs.map(l => ({ action: l.action, at: l.createdAt, metadata: l.metadata })),
      workflow: workflow.map(w => ({ stage: w.stage, at: w.occurredAt })),
    };
  }
}
