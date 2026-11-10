"use client";

import type { ComponentProps } from "react";
import { Drawer } from "@/components/ds/Drawer";
import styles from "./FinancialEditorSurface.module.css";

/** The same editor can live in the full loan workspace or open on its own. */
export function FinancialEditorSurface({ inline = false, ...props }: ComponentProps<typeof Drawer> & { inline?: boolean }) {
  if (!inline) return <Drawer {...props} />;
  return <section className={styles.surface} aria-label={props.ariaLabel || (typeof props.title === "string" ? props.title : undefined)}>
    {props.title || props.sub ? <header><h3>{props.title}</h3>{props.sub ? <p>{props.sub}</p> : null}</header> : null}
    {props.children}
    {props.footer ? <div className={styles.footer}>{props.footer}</div> : null}
  </section>;
}
