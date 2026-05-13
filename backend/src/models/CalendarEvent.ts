import mongoose, { Schema } from 'mongoose';

export interface ICalendarEvent {
  _id: string;
  accountId: string;
  googleEventId: string;
  title: string;
  description?: string;
  startDateTime: string;
  endDateTime: string;
  allDay: boolean;
  source: 'lyrium' | 'google';
  lastSyncedAt: string;
  deleted: boolean;
  // Google Calendar specific fields for full fidelity
  location?: string;
  attendees?: string[];
  colorId?: string;
  recurrence?: string[];
  updatedAt?: string;
}

const calendarEventSchema = new Schema<ICalendarEvent>({
  _id: { type: String, required: true },
  accountId: { type: String, required: true, index: true },
  googleEventId: { type: String, required: true, index: true },
  title: { type: String, required: true },
  description: { type: String, default: '' },
  startDateTime: { type: String, required: true },
  endDateTime: { type: String, required: true },
  allDay: { type: Boolean, default: false },
  source: { type: String, enum: ['lyrium', 'google'], default: 'google' },
  lastSyncedAt: { type: String, default: () => new Date().toISOString() },
  deleted: { type: Boolean, default: false, index: true },
  location: { type: String, default: '' },
  attendees: { type: [String], default: [] },
  colorId: { type: String, default: '' },
  recurrence: { type: [String], default: [] },
  updatedAt: { type: String },
}, { _id: false, versionKey: false });

calendarEventSchema.index({ accountId: 1, deleted: 1, startDateTime: 1 });
calendarEventSchema.index({ accountId: 1, googleEventId: 1 }, { unique: true });

calendarEventSchema.set('toJSON', {
  transform: (_doc: any, ret: any) => {
    ret.id = ret._id;
    delete ret._id;
    return ret;
  }
});

export const CalendarEvent = mongoose.model<ICalendarEvent>('CalendarEvent', calendarEventSchema);
