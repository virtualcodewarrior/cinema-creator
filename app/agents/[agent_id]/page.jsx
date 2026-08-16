import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import AgentChatClient from './AgentChatClient';

export default function AgentChatPage() {
  const { agentId } = useParams();
  const [agentDetails, setAgentDetails] = useState(null);
  const [initialHistory, setInitialHistory] = useState([]);
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAgentData = async () => {
      try {
        const apiKey = localStorage.getItem('ai_cinema_api_key');
        const headers = { 'x-api-key': apiKey };

        const [agentRes, historyRes] = await Promise.all([
          fetch(`/api/agents/${agentId}`, { headers }),
          fetch(`/api/agents/${agentId}/history?limit=50`, { headers }),
        ]);

        if (agentRes.ok) {
          const agentData = await agentRes.json();
          setAgentDetails(agentData);
          setUserData({
            email: agentData?.user?.email || null,
            balance: agentData?.user?.balance || 0,
          });
        }

        if (historyRes.ok) {
          const historyData = await historyRes.json();
          setInitialHistory(historyData?.history || []);
        }
      } catch (err) {
        console.error('Failed to fetch agent data:', err);
      } finally {
        setLoading(false);
      }
    };

    if (agentId) {
      fetchAgentData();
    }
  }, [agentId]);

  if (loading) {
    return (
      <div className="h-screen w-full bg-black flex items-center justify-center">
        <div className="text-white/60">Loading...</div>
      </div>
    );
  }

  if (!agentDetails) {
    return (
      <div className="h-screen w-full bg-black flex items-center justify-center">
        <div className="text-white/60">Agent not found</div>
      </div>
    );
  }

  return <AgentChatClient agentDetails={agentDetails} initialHistory={initialHistory} userData={userData} />;
}
