export function PageMessage({
  children,
  message,
}: {
  readonly children?: React.ReactNode;
  readonly message: string;
}) {
  return (
    <main className="flex min-h-svh items-center justify-center bg-muted/30 p-5 text-center">
      <div>
        <p className="text-muted-foreground" role="status">
          {message}
        </p>
        {children}
      </div>
    </main>
  );
}
