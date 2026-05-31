import type { AutomationType } from '@omnipos/db';

export type DeliveryMode = 'BOTH' | 'SMS' | 'EMAIL';
export type Timing = 'none' | 'before' | 'after';

export interface TypeMeta {
  label: string;
  group: string;
  timing: Timing;
  deliveryMode: DeliveryMode;
  enabled: boolean;
  offsetHours: number;
  template: string;
  subject: string;
}

/** Supported merge tags (the %token% data contract), grouped for the UI palette. */
export const MERGE_TAGS: { group: string; tags: { token: string; label: string }[] }[] = [
  { group: 'Client', tags: [
    { token: '%first_name%', label: 'First Name' },
    { token: '%last_name%', label: 'Last Name' },
    { token: '%pets%', label: 'Pets' },
    { token: '%client_address%', label: 'Client Address' },
  ] },
  { group: 'Business', tags: [
    { token: '%business_name%', label: 'Business Name' },
    { token: '%business_address%', label: 'Business Address' },
    { token: '%business_phone%', label: 'Business Phone' },
  ] },
  { group: 'Appointment', tags: [
    { token: '%appointment_date%', label: 'Appointment Date' },
    { token: '%appointment_start_time%', label: 'Start Time' },
    { token: '%appointment_end_time%', label: 'End Time' },
    { token: '%appointment_time_with_arrival_window%', label: 'Time With Arrival Window' },
    { token: '%day_of_week%', label: 'Day Of Week' },
    { token: '%services%', label: 'Services' },
    { token: '%groomer%', label: 'Groomer' },
  ] },
  { group: 'Billing', tags: [
    { token: '%balance%', label: 'Balance' },
    { token: '%bill_link%', label: 'Bill Link' },
    { token: '%invoice_link%', label: 'Invoice Link' },
  ] },
];

export const ALL_MERGE_TOKENS = MERGE_TAGS.flatMap(g => g.tags.map(t => t.token));

const B = '%business_name%';

/** Per-type configuration defaults + static metadata (label/group/timing). */
export const TYPE_META: Record<AutomationType, TypeMeta> = {
  NEW_APPOINTMENT: {
    label: 'New Appointment', group: 'Booking lifecycle', timing: 'none', deliveryMode: 'BOTH', enabled: true, offsetHours: 0,
    template: `Hi %first_name%, your appointment for %pets% at ${B} is booked for %appointment_date% at %appointment_start_time%. See you then!`,
    subject: `Your ${B} appointment confirmation for %pets%`,
  },
  RESCHEDULED_APPOINTMENT: {
    label: 'Rescheduled Appointment', group: 'Booking lifecycle', timing: 'none', deliveryMode: 'BOTH', enabled: true, offsetHours: 0,
    template: `Hi %first_name%, %pets%’s appointment has been rescheduled to %appointment_date% at %appointment_start_time%.`,
    subject: `Your ${B} appointment was rescheduled`,
  },
  CANCELLED_APPOINTMENT: {
    label: 'Cancelled Appointment', group: 'Booking lifecycle', timing: 'none', deliveryMode: 'BOTH', enabled: true, offsetHours: 0,
    template: `Hi %first_name%, %pets%’s appointment on %appointment_date% has been cancelled. Call %business_phone% to rebook.`,
    subject: `Your ${B} appointment was cancelled`,
  },
  APPOINTMENT_REMINDER: {
    label: 'Appointment Reminder', group: 'Reminders', timing: 'before', deliveryMode: 'BOTH', enabled: true, offsetHours: 24,
    template: `Hi %first_name%, reminder: %pets%’s appointment is on %appointment_date% at %appointment_start_time%. Reply YES to confirm.`,
    subject: `Reminder: %pets%’s appointment at ${B}`,
  },
  SECONDARY_REMINDER: {
    label: 'Secondary Reminder', group: 'Reminders', timing: 'before', deliveryMode: 'SMS', enabled: false, offsetHours: 48,
    template: `Reminder: %pets%’s grooming is coming up on %appointment_date% at %appointment_start_time%. See you soon!`,
    subject: `Upcoming appointment for %pets%`,
  },
  SAME_DAY_REMINDER: {
    label: 'Same-Day Reminder', group: 'Reminders', timing: 'before', deliveryMode: 'SMS', enabled: true, offsetHours: 2,
    template: `See you today! %pets%’s appointment is at %appointment_start_time%.`,
    subject: `Today: %pets%’s appointment`,
  },
  BEFORE_APPT_REMINDER: {
    label: 'Before Appt. Reminder', group: 'Reminders', timing: 'before', deliveryMode: 'SMS', enabled: false, offsetHours: 1,
    template: `%pets%’s appointment starts at %appointment_start_time%. Please arrive within %appointment_time_with_arrival_window%.`,
    subject: `Your appointment is coming up`,
  },
  WAITING_LIST: {
    label: 'Waiting List', group: 'Booking lifecycle', timing: 'none', deliveryMode: 'BOTH', enabled: false, offsetHours: 0,
    template: `Good news %first_name%! A spot opened up for %pets% on %appointment_date% at %appointment_start_time%. Reply to claim it.`,
    subject: `A spot opened up at ${B}`,
  },
  FORM_ACCEPTANCE: {
    label: 'Form acceptance message', group: 'Forms', timing: 'none', deliveryMode: 'EMAIL', enabled: true, offsetHours: 0,
    template: `Thank you %first_name% — we’ve received and accepted your form for %pets%.`,
    subject: `Your ${B} form was accepted`,
  },
  FORM_REJECTION: {
    label: 'Form rejection message', group: 'Forms', timing: 'none', deliveryMode: 'EMAIL', enabled: false, offsetHours: 0,
    template: `Hi %first_name%, we need a bit more information on the form for %pets%. Please call %business_phone%.`,
    subject: `Action needed on your ${B} form`,
  },
  VACCINATION_REMINDER: {
    label: 'Vaccination Reminder', group: 'Reminders', timing: 'before', deliveryMode: 'BOTH', enabled: true, offsetHours: 336,
    template: `%pets%’s vaccination is expiring soon. Please bring updated records to your next visit.`,
    subject: `%pets%’s vaccination is expiring`,
  },
  REBOOK_REMINDER: {
    label: 'Rebook Reminder', group: 'Reminders', timing: 'after', deliveryMode: 'BOTH', enabled: true, offsetHours: 720,
    template: `Hi %first_name%, it’s been a while since %pets%’s last groom. Ready to rebook? Call %business_phone%.`,
    subject: `Time to rebook %pets%?`,
  },
  PET_BIRTHDAY_REMINDER: {
    label: 'Pet Birthday Reminder', group: 'Reminders', timing: 'none', deliveryMode: 'BOTH', enabled: true, offsetHours: 0,
    template: `🎉 Happy birthday %pets%! Enjoy a treat on us at your next visit to ${B}.`,
    subject: `Happy birthday %pets%! 🎉`,
  },
  SEND_AGREEMENT: {
    label: 'Send Agreement', group: 'Documents & billing', timing: 'none', deliveryMode: 'EMAIL', enabled: false, offsetHours: 0,
    template: `Hi %first_name%, please review and sign your service agreement before %pets%’s appointment: %bill_link%`,
    subject: `Please sign your ${B} agreement`,
  },
  REQUEST_DEPOSIT: {
    label: 'Request Deposit', group: 'Documents & billing', timing: 'none', deliveryMode: 'BOTH', enabled: false, offsetHours: 0,
    template: `Hi %first_name%, a deposit is required to confirm %pets%’s appointment. Pay here: %bill_link%`,
    subject: `Deposit required for your ${B} appointment`,
  },
  SEND_INVOICE: {
    label: 'Send Invoice', group: 'Documents & billing', timing: 'none', deliveryMode: 'EMAIL', enabled: true, offsetHours: 0,
    template: `Hi %first_name%, here’s your invoice for %pets%: %invoice_link%. Balance due: %balance%.`,
    subject: `Your ${B} invoice`,
  },
  COLLECT_CARD: {
    label: 'Collect Card', group: 'Documents & billing', timing: 'none', deliveryMode: 'BOTH', enabled: false, offsetHours: 0,
    template: `Hi %first_name%, please add a card on file to secure %pets%’s appointment: %bill_link%`,
    subject: `Add a card on file at ${B}`,
  },
  PICKUP_REMINDER: {
    label: 'Pickup Reminder', group: 'Day-of', timing: 'none', deliveryMode: 'SMS', enabled: true, offsetHours: 0,
    template: `%pets% is all done and ready for pickup at ${B}! 🐾`,
    subject: `%pets% is ready for pickup`,
  },
  ETA_MESSAGE: {
    label: 'ETA Message', group: 'Day-of', timing: 'none', deliveryMode: 'SMS', enabled: false, offsetHours: 0,
    template: `Hi %first_name%, %pets% will be ready around %appointment_end_time%.`,
    subject: `%pets%’s pickup time`,
  },
  OPPORTUNITY_FOLLOWUP: {
    label: 'Opportunity Follow-up Message', group: 'Day-of', timing: 'after', deliveryMode: 'BOTH', enabled: false, offsetHours: 24,
    template: `Hi %first_name%, thanks for visiting ${B}! We’d love to see %pets% again — reply to book your next visit.`,
    subject: `Thanks for visiting ${B}`,
  },
  ARRIVAL_WINDOW: {
    label: 'Arrival Window', group: 'Day-of', timing: 'before', deliveryMode: 'SMS', enabled: false, offsetHours: 12,
    template: `Hi %first_name%, please arrive for %pets%’s appointment within %appointment_time_with_arrival_window% on %appointment_date%.`,
    subject: `Your arrival window at ${B}`,
  },
};

export const AUTOMATION_TYPES = Object.keys(TYPE_META) as AutomationType[];

/** Context values resolved from a booking/customer/pet/store for merge-tag rendering. */
export interface MergeContext {
  first_name?: string;
  last_name?: string;
  pets?: string;
  business_name?: string;
  business_address?: string;
  business_phone?: string;
  client_address?: string;
  appointment_date?: string;
  appointment_start_time?: string;
  appointment_end_time?: string;
  appointment_time_with_arrival_window?: string;
  day_of_week?: string;
  services?: string;
  groomer?: string;
  balance?: string;
  bill_link?: string;
  invoice_link?: string;
}

/** Legacy {{token}} → %token% aliases so older saved templates still render. */
const LEGACY: Record<string, keyof MergeContext> = {
  customerName: 'first_name',
  petName: 'pets',
  time: 'appointment_start_time',
};

/**
 * Replace %merge_tags% (and legacy {{tokens}}) with resolved values.
 * Unknown / unresolved tags collapse to an empty string.
 */
export function renderTemplate(template: string, ctx: MergeContext): string {
  let out = template.replace(/%([a-z_]+)%/g, (_m, key: string) => {
    const v = (ctx as Record<string, string | undefined>)[key];
    return v ?? '';
  });
  out = out.replace(/\{\{(\w+)\}\}/g, (_m, key: string) => {
    const mapped = LEGACY[key];
    if (key === 'customerName') return ctx.first_name ?? '';
    return mapped ? ctx[mapped] ?? '' : '';
  });
  return out;
}
