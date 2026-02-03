import type { UsdcIntent } from './policy';
import type { RpcHealthStatus } from '@/providers/base_usdc/health';

export type CanActInput = {
  user_id: string;
  agent_id: string;
  intent: UsdcIntent;
  idempotency_key: string;
};

export type CanActResult = {
  allowed: boolean;
  reason: string;
  requires_step_up: boolean;
  quote_id: string | null;
  expires_at: string | null;
  freshness_status: RpcHealthStatus;
};

export type ExecuteInput = {
  quote_id: string;
  idempotency_key: string;
  step_up_token?: string | null;
  signed_payload?: string | null;
};

export type ExecuteResult = {
  status: string;
  exec_id: string | null;
  tx_hash?: string | null;
  failure_reason?: string | null;
  requires_step_up?: boolean;
  instructions?: Record<string, unknown> | null;
};
