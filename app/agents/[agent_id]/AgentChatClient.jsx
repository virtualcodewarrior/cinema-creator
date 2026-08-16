"use client";

import { AiAgent } from "ai-agent";
import "ai-agent/tailwind.css";
import { useCallback, useEffect, useRef } from "react";
import axios from "axios";

const STORAGE_KEY = "ai_cinema_api_key";

/**
 * AgentChatClient — renders the AiAgent library component with server-fetched agent details
 * and optional initial history.
 *
 * Sets up an axios interceptor to inject the API key into all requests.
 */
export default function AgentChatClient({ agentDetails, initialHistory, userData }) {
  const interceptorRef = useRef(null);

  console.log("[AgentChatClient] Rendering", { 
    hasAgentDetails: !!agentDetails, 
    hasHistory: !!initialHistory, 
    hasUserData: !!userData 
  });

  useEffect(() => {
    const getKey = () => {
      if (typeof window === "undefined") return null;
      return localStorage.getItem(STORAGE_KEY);
    };

    const apiKey = getKey();
    if (!apiKey) return;

    interceptorRef.current = axios.interceptors.request.use((config) => {
      const isRelative =
        config.url.startsWith("/") || !config.url.startsWith("http");
      // Include specific proxy paths to be sure
      const isInternalProxy = config.url.includes('/api/agents') || config.url.includes('/api/v1');
      
      if (isRelative || isInternalProxy) {
        config.headers["x-api-key"] = apiKey;
      }
      return config;
    });

    return () => {
      if (interceptorRef.current !== null) {
        axios.interceptors.request.eject(interceptorRef.current);
      }
    };
  }, []);

  const useUser = useCallback(
    () => ({
      user: {
        username: userData?.email?.split("@")[0] || "Studio User",
        name: userData?.email?.split("@")[0] || "Studio User",
        email: userData?.email || null,
        profile_photo: null,
        balance: userData?.balance || 0,
      },
      isAuthorized: !!userData,
    }),
    [userData]
  );

  return (
    <div className="h-screen w-full bg-black">
      <AiAgent
        initialAgentDetails={agentDetails}
        initialHistory={initialHistory}
        useUser={useUser}
        usedIn="ai-cinema"
      />
    </div>
  );
}
