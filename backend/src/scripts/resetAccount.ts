/**
 * Reset account for manual testing.
 * Removes subscription, Stripe data, and resets account to "just registered" state.
 *
 * Usage: npx tsx src/scripts/resetAccount.ts chemamj08@gmail.com
 */

import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import Stripe from 'stripe';
import { Account } from '../models/Account.js';
import { Subscription } from '../models/Subscription.js';
import { Subaccount } from '../models/Subaccount.js';

const MONGODB_URI = process.env.MONGODB_URI || '';
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2026-02-25.clover',
});

async function main() {
  const email = process.argv[2];
  if (!email) {
    console.error('Usage: npx tsx src/scripts/resetAccount.ts <email>');
    process.exit(1);
  }

  await mongoose.connect(MONGODB_URI, { dbName: 'lyrium' });
  console.log('Connected to MongoDB');

  // Find account
  const account = await Account.findOne({ email });
  if (!account) {
    console.error(`Account not found: ${email}`);
    await mongoose.disconnect();
    process.exit(1);
  }

  const accountId = account._id;
  console.log(`Found account: ${accountId} (${email})`);

  // Find subscription
  const sub = await Subscription.findOne({ accountId });
  if (sub) {
    console.log(`Current subscription: plan=${sub.plan}, interval=${sub.interval}, status=${sub.status}, autoRenew=${sub.autoRenew}`);
    console.log(`  stripeCustomerId: ${sub.stripeCustomerId}`);
    console.log(`  stripeSubscriptionId: ${sub.stripeSubscriptionId}`);
    console.log(`  currentPeriodEnd: ${sub.currentPeriodEnd}`);

    // Cancel Stripe subscription if exists
    if (sub.stripeSubscriptionId) {
      try {
        await stripe.subscriptions.cancel(sub.stripeSubscriptionId);
        console.log(`  ✅ Stripe subscription canceled: ${sub.stripeSubscriptionId}`);
      } catch (e: any) {
        console.log(`  ⚠️ Stripe subscription cancel failed (may not exist): ${e.message}`);
      }
    }

    // Detach payment methods if exists
    if (sub.stripePaymentMethodId) {
      try {
        await stripe.paymentMethods.detach(sub.stripePaymentMethodId);
        console.log(`  ✅ Payment method detached: ${sub.stripePaymentMethodId}`);
      } catch (e: any) {
        console.log(`  ⚠️ Payment method detach failed: ${e.message}`);
      }
    }

    // Delete subscription from MongoDB
    await Subscription.deleteOne({ accountId });
    console.log(`  ✅ Subscription deleted from MongoDB`);
  } else {
    console.log('No subscription found');
  }

  // Reset account fields related to billing
  await Account.updateOne({ _id: accountId }, {
    $set: { nextInvoiceNumber: 1 },
  });
  console.log('✅ Account billing fields reset');

  // Summary
  console.log('\n=== ACCOUNT RESET COMPLETE ===');
  console.log(`Email: ${email}`);
  console.log(`Account ID: ${accountId}`);
  console.log('State: No subscription, no Stripe data');
  console.log('Next: User will need to go through the full signup flow to get a trial subscription');

  await mongoose.disconnect();
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
