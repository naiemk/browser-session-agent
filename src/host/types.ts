export type NotifyLevel = "info" | "warning" | "error";

export interface OperatorHost {
  notify(message: string, level?: NotifyLevel): void;
  input(title: string, placeholder?: string): Promise<string | undefined>;
  confirm(title: string, message: string): Promise<boolean>;
  select(title: string, options: string[]): Promise<string | undefined>;
  getActiveTools(): string[];
  setActiveTools(names: string[]): void;
  getAllTools(): Array<{ name: string }>;
}

export interface UiRequest {
  requestId: string;
  kind: "input" | "confirm" | "select";
  title: string;
  message?: string;
  placeholder?: string;
  options?: string[];
}
