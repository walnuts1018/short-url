"use client";

import { useEffect, useState } from "react";

export function ClientDateTime(props: {
  value: string | null | undefined;
  empty?: string;
}) {
  const empty = props.empty ?? "-";
  const [text, setText] = useState<string>(empty);

  useEffect(() => {
    const value = props.value;
    if (!value) {
      setText(empty);
      return;
    }
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) {
      setText(value);
      return;
    }
    setText(d.toLocaleString());
  }, [props.value, empty]);

  return <span>{text}</span>;
}
