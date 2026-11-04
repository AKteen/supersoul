export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-4xl font-semibold tracking-tight">SuperSoul</h1>
      <p className="text-center text-zinc-600 dark:text-zinc-400">
        Video calling scaffold — Phase 0
      </p>
      <p className="text-sm text-zinc-500">
        API health:{" "}
        <code className="rounded bg-zinc-100 px-1 py-0.5 dark:bg-zinc-800">
          {process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"}/health
        </code>
      </p>
    </main>
  );
}
