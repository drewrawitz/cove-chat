export function PageMessage({ message }: { readonly message: string }) {
  return (
    <main className="flex min-h-svh items-center justify-center bg-muted/30 p-5">
      <p className="text-muted-foreground" role="status">
        {message}
      </p>
    </main>
  );
}
