import { prisma } from "@/lib/db/client";
import type { Contact } from "@/app/generated/prisma/client";

interface UpsertContactInput {
  workspaceId: string;
  instagramAccountId: string;
  igUserId: string;
  username?: string;
}

/**
 * Creates the contact on first sight, or refreshes its username when a newer
 * one came in (an Instagram handle can change). Skips the write entirely when
 * nothing changed, so replays of the same event don't bump `updatedAt`.
 */
export async function upsertContact(input: UpsertContactInput): Promise<Contact> {
  const { workspaceId, instagramAccountId, igUserId, username } = input;

  const existing = await prisma.contact.findUnique({
    where: {
      instagramAccountId_igUserId: { instagramAccountId, igUserId },
    },
  });

  if (!existing) {
    return prisma.contact.create({
      data: { workspaceId, instagramAccountId, igUserId, username },
    });
  }

  if (username && username !== existing.username) {
    return prisma.contact.update({
      where: { id: existing.id },
      data: { username },
    });
  }

  return existing;
}

export async function addTag(contactId: string, tag: string): Promise<Contact> {
  const trimmed = tag.trim();
  const contact = await prisma.contact.findUniqueOrThrow({
    where: { id: contactId },
  });

  if (!trimmed || contact.tags.includes(trimmed)) return contact;

  return prisma.contact.update({
    where: { id: contactId },
    data: { tags: { push: trimmed } },
  });
}

export async function removeTag(contactId: string, tag: string): Promise<Contact> {
  const trimmed = tag.trim();
  const contact = await prisma.contact.findUniqueOrThrow({
    where: { id: contactId },
  });

  return prisma.contact.update({
    where: { id: contactId },
    data: { tags: contact.tags.filter((t) => t !== trimmed) },
  });
}
