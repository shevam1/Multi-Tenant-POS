import { Body, Controller, Get, NotFoundException, Param, Post } from '@nestjs/common';
import { Public } from '../auth/decorators';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { FormsService } from './forms.service';

/**
 * Public pre-visit signing flow (spec §6). The client opens a link
 * (/sign/:bookingId) on their own device — no auth — and signs mandatory forms
 * before arrival. The bookingId (an unguessable cuid) is the access token.
 */
@Controller('public/sign')
export class PublicFormsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly forms: FormsService,
    private readonly realtime: RealtimeGateway,
  ) {}

  /** Booking summary + forms to sign + which are already signed. */
  @Public()
  @Get(':bookingId')
  async getSigningSession(@Param('bookingId') bookingId: string) {
    const booking = await this.prisma.asSystem(tx =>
      tx.booking.findUnique({
        where: { id: bookingId },
        include: {
          pet: { select: { name: true, breed: true } },
          store: { select: { name: true } },
          customer: { select: { fullName: true } },
          consents: { select: { formType: true, signedAt: true } },
        },
      }),
    );
    if (!booking) throw new NotFoundException('Booking not found');

    const forms = await this.forms.effectiveForms(booking.tenantId);
    const signedTypes = new Set(
      booking.consents.filter(c => c.signedAt).map(c => c.formType),
    );

    return {
      booking: {
        id: booking.id,
        petName: booking.pet?.name ?? null,
        petBreed: booking.pet?.breed ?? null,
        storeName: booking.store.name,
        customerName: booking.customer.fullName,
        scheduledStart: booking.scheduledStart,
      },
      forms: forms.map(f => ({
        formType: f.formType,
        title: f.title,
        mandatory: f.mandatory,
        fields: f.fields,
        signed: signedTypes.has(f.formType),
      })),
    };
  }

  /** Submit a signed form. */
  @Public()
  @Post(':bookingId/:formType')
  async submit(
    @Param('bookingId') bookingId: string,
    @Param('formType') formType: string,
    @Body() body: { signature: string; payload: Record<string, unknown> },
  ) {
    const booking = await this.prisma.asSystem(tx =>
      tx.booking.findUnique({ where: { id: bookingId } }),
    );
    if (!booking) throw new NotFoundException('Booking not found');

    // Upsert the consent submission (idempotent re-sign)
    const submission = await this.prisma.asSystem(async tx => {
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
      const existing = await tx.consentSubmission.findFirst({ where: { bookingId, formType } });
      if (existing) {
        return tx.consentSubmission.update({
          where: { id: existing.id },
          data: { signature: body.signature, payload: (body.payload ?? {}) as object, signedAt: new Date() },
        });
      }
      return tx.consentSubmission.create({
        data: {
          tenantId: booking.tenantId,
          bookingId,
          formType,
          signature: body.signature,
          payload: (body.payload ?? {}) as object,
          signedAt: new Date(),
        },
      });
    });

    // Notify admin in real time that a form was signed
    this.realtime.emitBookingStatusChange(booking.storeId, { bookingId, formSigned: formType });

    return { ok: true, signedAt: submission.signedAt };
  }
}
