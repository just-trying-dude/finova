import React, { createContext, useEffect, useMemo, useState } from "react";
import { getToken } from "./auth.js";
import { usernameFromJwt } from "./utils/jwt.js";

export const AuthContext = createContext({
  token: "",
  username: "",
  setUsername: () => {}
});

export function AuthProvider({ children }) {
  const [token, setTokenState] = useState(() => getToken());
  const [username, setUsername] = useState(() => usernameFromJwt(getToken()));

  useEffect(() => {
    function onAuthChanged() {
      const t = getToken();
      setTokenState(t);
      setUsername(usernameFromJwt(t));
    }
    window.addEventListener("auth:changed", onAuthChanged);
    return () => window.removeEventListener("auth:changed", onAuthChanged);
  }, []);

  const value = useMemo(() => ({ token, username, setUsername }), [token, username]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

