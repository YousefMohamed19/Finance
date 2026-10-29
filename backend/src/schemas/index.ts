import { ModelDefinition } from '@nestjs/mongoose';
import { User, UserSchema } from './user.schema';
import { Jar, JarSchema, AllocationVersion, AllocationVersionSchema } from './jar.schema';
import { Transaction, TransactionSchema } from './transaction.schema';
import { Counterparty, CounterpartySchema } from './counterparty.schema';
import { RecurringRule, RecurringRuleSchema } from './recurring-rule.schema';
import { Goal, GoalSchema } from './goal.schema';
import { DraftEntry, DraftEntrySchema } from './draft-entry.schema';
import { AuditLog, AuditLogSchema } from './audit-log.schema';
import { Notification, NotificationSchema } from './notification.schema';
import { MonthlyReport, MonthlyReportSchema } from './monthly-report.schema';

export const MODELS: ModelDefinition[] = [
  { name: User.name, schema: UserSchema },
  { name: Jar.name, schema: JarSchema },
  { name: AllocationVersion.name, schema: AllocationVersionSchema },
  { name: Transaction.name, schema: TransactionSchema },
  { name: Counterparty.name, schema: CounterpartySchema },
  { name: RecurringRule.name, schema: RecurringRuleSchema },
  { name: Goal.name, schema: GoalSchema },
  { name: DraftEntry.name, schema: DraftEntrySchema },
  { name: AuditLog.name, schema: AuditLogSchema },
  { name: Notification.name, schema: NotificationSchema },
  { name: MonthlyReport.name, schema: MonthlyReportSchema },
];

export * from './user.schema';
export * from './jar.schema';
export * from './transaction.schema';
export * from './counterparty.schema';
export * from './recurring-rule.schema';
export * from './goal.schema';
export * from './draft-entry.schema';
export * from './audit-log.schema';
export * from './notification.schema';
export * from './monthly-report.schema';
