import { Account } from '../models/Account.js';
import { Subscription } from '../models/Subscription.js';

export async function createAccountWithInitialSubscription(accountData: Record<string, any>, subscriptionData: Record<string, any>) {
  const startSession = (Account as any).db?.startSession?.bind((Account as any).db);

  if (typeof startSession === 'function') {
    const session = await startSession();
    try {
      let createdAccount: any;
      await session.withTransaction(async () => {
        const createdAccounts = await Account.create([accountData], { session });
        createdAccount = createdAccounts[0];
        await Subscription.create([subscriptionData], { session });
      });
      return createdAccount;
    } finally {
      await session.endSession();
    }
  }

  const createdAccount = await Account.create(accountData);

  try {
    await Subscription.create(subscriptionData);
    return createdAccount;
  } catch (error) {
    await Promise.allSettled([
      Account.deleteMany({ _id: accountData._id }),
      Subscription.deleteMany({ accountId: accountData._id }),
    ]);
    throw error;
  }
}