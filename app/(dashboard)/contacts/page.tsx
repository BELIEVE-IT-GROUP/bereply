import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db/client";
import { ensureWorkspaceForUser } from "@/lib/workspace";
import ContactTags from "@/components/contact-tags";

const PAGE_SIZE = 50;

export default async function ContactsPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const workspace = await ensureWorkspaceForUser(
    session.user.id,
    session.user.email
  );

  const contacts = await prisma.contact.findMany({
    where: { workspaceId: workspace.id },
    orderBy: { updatedAt: "desc" },
    take: PAGE_SIZE,
  });

  if (contacts.length === 0) {
    return (
      <div className="panel rounded p-8 text-center sm:p-12">
        <h3 className="text-lg font-semibold mb-2">No contacts yet</h3>
        <p className="mx-auto max-w-sm text-sm text-muted">
          Todavía no hay contactos — aparecen automáticamente cuando alguien
          te escribe o comenta.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted">
        {contacts.length} contact{contacts.length !== 1 ? "s" : ""}
      </p>
      <div className="space-y-3">
        {contacts.map((contact) => (
          <ContactTags
            key={contact.id}
            contactId={contact.id}
            username={contact.username}
            igUserId={contact.igUserId}
            tags={contact.tags}
          />
        ))}
      </div>
    </div>
  );
}
