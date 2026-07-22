import type { ReactElement, ReactNode } from "react";

interface PageMessageProps {
  readonly children?: ReactNode;
  readonly message: string;
  readonly theme?: "dark" | "light";
}

export function PageMessage({
  children,
  message,
  theme = "light",
}: PageMessageProps): ReactElement {
  return (
    <main
      className={`flex min-h-svh items-center justify-center p-5 text-center ${
        theme === "dark" ? "dark bg-background text-foreground" : "bg-muted/30"
      }`}
    >
      <div>
        <p className="text-muted-foreground" role="status">
          {message}
        </p>
        {children}
      </div>
    </main>
  );
}
