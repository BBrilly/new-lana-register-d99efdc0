import { finalizeEvent } from "nostr-tools";
import { getAuthSession } from "@/utils/wifAuth";

const hexToBytes = (hex: string) =>
  new Uint8Array(hex.match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16)));

/**
 * Creates a signed NIP-98 style (kind 27235) admin authorization event.
 * Used by admin edge functions that authenticate via Nostr keys instead of Supabase JWT.
 */
export const createAdminAuthEvent = (action: string, target: string) => {
  const session = getAuthSession();
  if (!session?.nostrHexId || !session?.nostrPrivateKey) {
    throw new Error("Admin session not found. Please log in again.");
  }

  return finalizeEvent(
    {
      kind: 27235,
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        ["action", action],
        ["target", target],
        ["admin", session.nostrHexId],
      ],
      content: `Authorize ${action} for ${target}`,
    },
    hexToBytes(session.nostrPrivateKey)
  );
};
