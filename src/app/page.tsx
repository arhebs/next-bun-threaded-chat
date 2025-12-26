import { ChatPanel } from "@/components/chat/ChatPanel";
import { ThreadSidebar } from "@/components/chat/ThreadSidebar";

export default function Home() {
  return (
    <div className="min-h-screen bg-[color:var(--background)] text-[color:var(--foreground)]">
      <div className="relative isolate min-h-screen overflow-hidden">
        <div
          className="pointer-events-none absolute inset-0 opacity-80"
          style={{
            backgroundImage:
              "radial-gradient(900px circle at 8% -10%, rgba(31, 122, 109, 0.25), transparent 60%), radial-gradient(1000px circle at 100% 0%, rgba(248, 180, 0, 0.2), transparent 55%)",
          }}
        />
        <div className="relative flex min-h-screen flex-col lg:flex-row">
          <ThreadSidebar />
          <ChatPanel />
        </div>
      </div>
    </div>
  );
}
