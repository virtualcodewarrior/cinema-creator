/**
 * Layout for /agents/* pages.
 * These pages host the AiAgent component full-screen — no studio chrome needed.
 * The api key is available via localStorage (ai_cinema_api_key).
 */
export const metadata = {
  title: "Agent Chat — AI Cinema",
};

export default function AgentsLayout({ children }) {
  return (
    <div className="h-screen w-full overflow-hidden bg-black">
      {children}
    </div>
  );
}
