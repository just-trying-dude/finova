import React, { createContext, useEffect, useMemo, useState } from "react";
import { getToken, getValidToken } from "./auth.js";
import { usernameFromJwt } from "./utils/jwt.js";

export const AuthContext = createContext({
  token: "",
  username: "",
  setUsername: () => {}
});

export function AuthProvider({ children }) {
  const [token, setTokenState] = useState(() => getValidToken());
  const [username, setUsername] = useState(() => usernameFromJwt(getValidToken()));

  useEffect(() => {
    function onAuthChanged() {
      const t = getValidToken();
      setTokenState(t);
      setUsername(usernameFromJwt(t));
    }
    window.addEventListener("auth:changed", onAuthChanged);
    return () => window.removeEventListener("auth:changed", onAuthChanged);
  }, []);

  const value = useMemo(() => ({ token, username, setUsername }), [token, username]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
