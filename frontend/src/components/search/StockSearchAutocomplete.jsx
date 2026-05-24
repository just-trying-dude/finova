import React, { useEffect, useId, useRef, useState } from "react";
import { searchStocks } from "../../api.js";
import { useDebouncedValue } from "../../hooks/useDebouncedValue.js";
import { Icon } from "../icons/Icon.jsx";

export function StockSearchAutocomplete({
  theme,
  placeholder = "Search company or symbol…",
  onSelect,
  onQueryChange,
  initialQuery = "",
  inputStyle,
  containerStyle
}) {
  const listId = useId();
  const rootRef = useRef(null);
  const inputRef = useRef(null);

  const [query, setQuery] = useState(initialQuery);
  const debounced = useDebouncedValue(query, 300);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [status, setStatus] = useState("idle");
  const [results, setResults] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    onQueryChange?.(query);
  }, [query, onQueryChange]);

  useEffect(() => {
    const q = debounced.trim();
    if (q.length < 1) {
      setResults([]);
      setStatus("idle");
      setError("");
      setActiveIndex(-1);
      return;
    }

    let cancelled = false;
    setStatus("loading");
    setError("");

    (async () => {
      try {
        const rows = await searchStocks(q, 10);
        if (cancelled) return;
        setResults(Array.isArray(rows) ? rows : []);
        setStatus("success");
        setActiveIndex(rows.length ? 0 : -1);
        setOpen(true);
      } catch (e) {
        if (!cancelled) {
          setResults([]);
          setStatus("error");
          setError(e?.message || "Search failed");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [debounced]);

  useEffect(() => {
    function onDocMouseDown(e) {
      if (!rootRef.current?.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, []);

  const showDropdown = open && query.trim().length > 0 && (status === "loading" || results.length > 0 || status === "error");

  function pick(item) {
    if (!item?.symbol) return;
    setQuery(item.company || item.symbol);
    setOpen(false);
    setActiveIndex(-1);
    onSelect?.(item);
  }

  function onKeyDown(e) {
    if (!showDropdown && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      setOpen(true);
      return;
    }

    if (e.key === "Escape") {
      setOpen(false);
      setActiveIndex(-1);
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!results.length) return;
      setActiveIndex((i) => (i + 1) % results.length);
      return;
    }

    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (!results.length) return;
      setActiveIndex((i) => (i <= 0 ? results.length - 1 : i - 1));
      return;
    }

    if (e.key === "Enter") {
      if (activeIndex >= 0 && results[activeIndex]) {
        e.preventDefault();
        pick(results[activeIndex]);
      }
    }
  }

  return (
    <div ref={rootRef} style={{ position: "relative", width: "100%", ...containerStyle }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          borderRadius: 14,
          border: `1px solid ${theme.inputBorder}`,
          background: theme.inputBg,
          padding: "10px 12px"
        }}
      >
        <Icon name="search" color={theme.icon} />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => {
            if (query.trim()) setOpen(true);
          }}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          role="combobox"
          aria-expanded={showDropdown}
          aria-controls={listId}
          aria-autocomplete="list"
          style={{
            width: "100%",
            border: "none",
            outline: "none",
            background: "transparent",
            color: theme.text,
            fontSize: 13,
            fontWeight: 700,
            ...inputStyle
          }}
        />
        {status === "loading" ? (
          <span style={{ color: theme.muted, fontSize: 11, fontWeight: 800, whiteSpace: "nowrap" }}>…</span>
        ) : null}
      </div>

      {showDropdown ? (
        <div
          id={listId}
          role="listbox"
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            left: 0,
            right: 0,
            zIndex: 50,
            borderRadius: 14,
            border: `1px solid ${theme.border}`,
            background: theme.panel,
            boxShadow: theme.shadow,
            overflow: "hidden",
            maxHeight: 320,
            overflowY: "auto"
          }}
        >
          {status === "error" ? (
            <div style={{ padding: "12px 14px", color: theme.red, fontSize: 12, fontWeight: 850 }}>{error}</div>
          ) : null}

          {status === "loading" && !results.length ? (
            <div style={{ padding: "12px 14px", color: theme.muted, fontSize: 12, fontWeight: 750 }}>Searching…</div>
          ) : null}

          {status === "success" && !results.length ? (
            <div style={{ padding: "12px 14px", color: theme.muted, fontSize: 12, fontWeight: 750 }}>No matches found</div>
          ) : null}

          {results.map((item, idx) => {
            const active = idx === activeIndex;
            return (
              <button
                key={`${item.symbol}-${idx}`}
                type="button"
                role="option"
                aria-selected={active}
                onMouseEnter={() => setActiveIndex(idx)}
                onClick={() => pick(item)}
                style={{
                  width: "100%",
                  textAlign: "left",
                  border: "none",
                  borderTop: idx === 0 ? "none" : `1px solid ${theme.border}`,
                  background: active ? theme.rowHover : "transparent",
                  padding: "11px 14px",
                  cursor: "pointer",
                  display: "grid",
                  gridTemplateColumns: "1fr auto",
                  gap: 8,
                  alignItems: "center"
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      fontWeight: 900,
                      fontSize: 13,
                      color: theme.text,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis"
                    }}
                  >
                    {item.company}
                  </div>
                  <div style={{ marginTop: 3, color: theme.muted, fontSize: 11, fontWeight: 700 }}>{item.symbol}</div>
                </div>
                <span
                  style={{
                    padding: "4px 8px",
                    borderRadius: 999,
                    border: `1px solid ${theme.border}`,
                    background: theme.chip,
                    color: theme.muted,
                    fontSize: 10,
                    fontWeight: 900,
                    letterSpacing: "0.4px"
                  }}
                >
                  {item.exchange || "—"}
                </span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
