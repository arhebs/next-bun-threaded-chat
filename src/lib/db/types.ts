export type ThreadRow = {
  id: string;
  title: string;
  created_at: number;
  updated_at: number;
};

export type Thread = {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
};

export type MessageRow = {
  id: string;
  thread_id: string;
  role: "user" | "assistant" | "system";
  content_text: string | null;
  tool_invocations_json: string | null;
  ui_message_json: string | null;
  created_at: number;
};
