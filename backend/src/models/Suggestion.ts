import mongoose, { Schema, Document } from 'mongoose';

export interface ISuggestion extends Document {
  text: string;
  createdAt: Date;
}

const SuggestionSchema = new Schema<ISuggestion>({
  text: { type: String, required: true, maxlength: 1000 },
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.model<ISuggestion>('Suggestion', SuggestionSchema);
