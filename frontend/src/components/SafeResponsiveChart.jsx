import React, { useEffect, useRef, useState } from "react";

export default function SafeResponsiveChart({ className = "", placeholder = "", children }) {
  const containerRef = useRef(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return undefined;

    const updateSize = () => {
      setSize({
        width: Math.floor(node.clientWidth || 0),
        height: Math.floor(node.clientHeight || 0),
      });
    };

    updateSize();
    let observer;
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(updateSize);
      observer.observe(node);
    }
    window.addEventListener("resize", updateSize);
    return () => {
      if (observer) observer.disconnect();
      window.removeEventListener("resize", updateSize);
    };
  }, []);

  const canRender = size.width > 20 && size.height > 20;

  return (
    <div ref={containerRef} className={className}>
      {canRender ? (
        React.isValidElement(children) ? (
          React.cloneElement(children, { width: size.width, height: size.height })
        ) : (
          children
        )
      ) : (
        <div className="flex h-full w-full items-center justify-center text-xs text-zinc-500">{placeholder || "Loading chart..."}</div>
      )}
    </div>
  );
}
