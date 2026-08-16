import { Routes, Route } from 'react-router-dom';
import AppShell from '../app/app-shell.jsx';
import AgentChatPage from './pages/AgentChatPage.jsx';
import AgentCreatePage from '../app/agents/create/page.jsx';
import AgentEditPage from '../app/agents/edit/[id]/page.jsx';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<AppShell />} />
      <Route path="/studio/*" element={<AppShell />} />
      <Route path="/agents/:agentId" element={<AgentChatPage />} />
      <Route path="/agents/create" element={<AgentCreatePage />} />
      <Route path="/agents/edit/:id" element={<AgentEditPage />} />
      <Route path="/workflow/*" element={<AppShell />} />
    </Routes>
  );
}
