'use client';

import React, { useEffect, useState, useMemo } from 'react';

interface CodeSnippet {
  filename: string;
  code: string;
  tests: Array<{ name: string; verdict: string; time: string }>;
}

const SNIPPETS: CodeSnippet[] = [
  {
    filename: 'bfs.cpp',
    code: `#include <iostream>
#include <vector>
#include <queue>

void bfs(int start, const std::vector<std::vector<int>>& adj) {
    std::vector<bool> visited(adj.size(), false);
    std::queue<int> q;
    visited[start] = true;
    q.push(start);
    while (!q.empty()) {
        int u = q.front(); q.pop();
        std::cout << u << " ";
        for (int v : adj[u]) {
            if (!visited[v]) {
                visited[v] = true;
                q.push(v);
            }
        }
    }
}`,
    tests: [
      { name: 'Test 1', verdict: 'AC', time: '12 ms' },
      { name: 'Test 2', verdict: 'AC', time: '18 ms' },
      { name: 'Test 3', verdict: 'AC', time: '15 ms' },
    ],
  },
  {
    filename: 'binary_search.cpp',
    code: `#include <iostream>
#include <vector>

int binarySearch(const std::vector<int>& arr, int target) {
    int left = 0;
    int right = static_cast<int>(arr.size()) - 1;
    while (left <= right) {
        int mid = left + (right - left) / 2;
        if (arr[mid] == target) return mid;
        if (arr[mid] < target) left = mid + 1;
        else right = mid - 1;
    }
    return -1;
}`,
    tests: [
      { name: 'Test 1', verdict: 'AC', time: '8 ms' },
      { name: 'Test 2', verdict: 'AC', time: '10 ms' },
      { name: 'Test 3', verdict: 'AC', time: '9 ms' },
    ],
  },
  {
    filename: 'stack.cpp',
    code: `#include <iostream>
#include <stack>
#include <string>

bool isValidParentheses(const std::string& s) {
    std::stack<char> st;
    for (char c : s) {
        if (c == '(' || c == '{' || c == '[') st.push(c);
        else {
            if (st.empty()) return false;
            char top = st.top(); st.pop();
            if ((c == ')' && top != '(') ||
                (c == '}' && top != '{') ||
                (c == ']' && top != '[')) return false;
        }
    }
    return st.empty();
}`,
    tests: [
      { name: 'Test 1', verdict: 'AC', time: '11 ms' },
      { name: 'Test 2', verdict: 'AC', time: '14 ms' },
      { name: 'Test 3', verdict: 'AC', time: '12 ms' },
    ],
  },
];

function highlightCpp(code: string): React.ReactNode[] {
  const lines = code.split('\n');
  return lines.map((line, lineIdx) => {
    // Quick regex token split
    const tokens: React.ReactNode[] = [];
    const regex =
      /(#include\s+<[^>]+>|\/\/[^\n]*|"(?:\\.|[^"\\])*"|\b(?:int|void|bool|char|size_t|auto|float|double)\b|\b(?:while|for|if|else|return|const|false|true|new|delete|class|struct)\b|\b\d+\b|[A-Za-z_]\w*|[^A-Za-z0-9_\s]+|\s+)/g;
    let match: RegExpExecArray | null;
    let key = 0;

    while ((match = regex.exec(line)) !== null) {
      const part = match[0];
      if (part.startsWith('#include')) {
        tokens.push(
          <span key={key++} className="token-prep">
            {part}
          </span>
        );
      } else if (part.startsWith('//')) {
        tokens.push(
          <span key={key++} className="token-comment">
            {part}
          </span>
        );
      } else if (part.startsWith('"')) {
        tokens.push(
          <span key={key++} className="token-str">
            {part}
          </span>
        );
      } else if (/^\d+$/.test(part)) {
        tokens.push(
          <span key={key++} className="token-num">
            {part}
          </span>
        );
      } else if (
        /^(while|for|if|else|return|const|false|true|new|delete|class|struct)$/.test(part)
      ) {
        tokens.push(
          <span key={key++} className="token-kw">
            {part}
          </span>
        );
      } else if (/^(int|void|bool|char|size_t|auto|float|double)$/.test(part)) {
        tokens.push(
          <span key={key++} className="token-type">
            {part}
          </span>
        );
      } else {
        tokens.push(<span key={key++}>{part}</span>);
      }
    }

    return (
      <div key={lineIdx} style={{ minHeight: '1.4em' }}>
        {tokens.length > 0 ? tokens : ' '}
      </div>
    );
  });
}

export default function MockCodeWindow() {
  const [snippetIndex, setSnippetIndex] = useState(0);
  const [typedLength, setTypedLength] = useState(0);
  const [showTests, setShowTests] = useState<number>(0);
  const [reducedMotion, setReducedMotion] = useState(false);

  const currentSnippet = SNIPPETS[snippetIndex];

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const media = window.matchMedia('(prefers-reduced-motion: reduce)');
      setReducedMotion(media.matches);
      if (media.matches) {
        setTypedLength(currentSnippet.code.length);
        setShowTests(currentSnippet.tests.length + 1);
      }
    }
  }, [currentSnippet]);

  // Typing effect
  useEffect(() => {
    if (reducedMotion) return;

    setTypedLength(0);
    setShowTests(0);

    let charIdx = 0;
    const fullCode = currentSnippet.code;
    const typingInterval = setInterval(() => {
      charIdx += 2; // type 2 chars per tick for snappy feel
      if (charIdx >= fullCode.length) {
        setTypedLength(fullCode.length);
        clearInterval(typingInterval);

        // Run tests
        let testIdx = 0;
        const testInterval = setInterval(() => {
          testIdx++;
          setShowTests(testIdx);
          if (testIdx > currentSnippet.tests.length) {
            clearInterval(testInterval);
            // Wait 3.5s before moving to next snippet
            setTimeout(() => {
              setSnippetIndex((prev) => (prev + 1) % SNIPPETS.length);
            }, 3500);
          }
        }, 350);
      } else {
        setTypedLength(charIdx);
      }
    }, 20);

    return () => {
      clearInterval(typingInterval);
    };
  }, [snippetIndex, currentSnippet, reducedMotion]);

  const displayedCode = useMemo(() => {
    return currentSnippet.code.slice(0, typedLength);
  }, [currentSnippet, typedLength]);

  return (
    <div
      style={{
        borderRadius: '12px',
        overflow: 'hidden',
        border: '1px solid var(--border-color)',
        background: 'var(--bg-code)',
        boxShadow: 'var(--box-shadow-lg)',
        fontFamily: "'JetBrains Mono', 'Fira Code', 'Courier New', monospace",
        fontSize: '0.82rem',
        color: '#e2e8f0',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Title Bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0.65rem 1rem',
          background: 'rgba(255, 255, 255, 0.04)',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
          <span
            style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#ef4444' }}
          />
          <span
            style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#f59e0b' }}
          />
          <span
            style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#10b981' }}
          />
        </div>
        <div style={{ color: '#94a3b8', fontSize: '0.8rem', fontWeight: 500 }}>
          {currentSnippet.filename}
        </div>
        <div style={{ width: '38px' }} />
      </div>

      {/* Editor Body */}
      <div
        style={{
          padding: '1rem',
          minHeight: '260px',
          overflowX: 'auto',
          lineHeight: '1.45',
        }}
      >
        {highlightCpp(displayedCode)}
        {typedLength < currentSnippet.code.length && (
          <span
            style={{
              display: 'inline-block',
              width: '8px',
              height: '14px',
              backgroundColor: 'var(--primary)',
              marginLeft: '2px',
              verticalAlign: 'middle',
              animation: 'blink 1s step-end infinite',
            }}
          />
        )}
      </div>

      {/* Judging Result Box */}
      {showTests > 0 && (
        <div
          style={{
            margin: '0.75rem 1rem 1rem 1rem',
            padding: '0.75rem',
            borderRadius: '8px',
            background: 'rgba(15, 23, 42, 0.9)',
            border: '1px solid rgba(255, 255, 255, 0.12)',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.35rem',
          }}
        >
          <div
            style={{
              fontSize: '0.75rem',
              color: '#94a3b8',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              fontWeight: 600,
              marginBottom: '0.2rem',
            }}
          >
            Kết quả chấm
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
            {currentSnippet.tests.map((t, idx) => {
              if (idx + 1 > showTests) return null;
              return (
                <span
                  key={idx}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                    padding: '0.2rem 0.5rem',
                    borderRadius: '4px',
                    fontSize: '0.75rem',
                    background: 'rgba(34, 197, 94, 0.15)',
                    color: '#4ade80',
                    border: '1px solid rgba(34, 197, 94, 0.3)',
                  }}
                >
                  <strong>{t.name}</strong> · {t.verdict} · {t.time}
                </span>
              );
            })}
            {showTests > currentSnippet.tests.length && (
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  padding: '0.2rem 0.6rem',
                  borderRadius: '4px',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  background: 'rgba(59, 130, 246, 0.2)',
                  color: '#60a5fa',
                  border: '1px solid rgba(59, 130, 246, 0.4)',
                }}
              >
                Điểm 1.00
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
