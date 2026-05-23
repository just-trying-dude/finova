import { fetchJson } from "./client.js";

export async function login({ username, password }) {
  return await fetchJson("/login", {
    method: "POST",
    body: { username, password }
  });
}

export async function register({ username, password }) {
  return await fetchJson("/register", {
    method: "POST",
    body: { username, password }
  });
}

