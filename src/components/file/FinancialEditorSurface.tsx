"use client";

import type { ComponentProps } from "react";
import { Drawer } from "@/components/ds/Drawer";
import styles from "./FinancialEditorSurface.module.css";

/** The same editor can live in the full loan workspace or open on its own. */
export function FinancialEditorSurface({ inline = false, ...props }: ComponentProps<typeof Drawer> & { inline?: boolean }) {
  if (!inline) return <Drawer {...props} />;
  if (!props.open) return null;
  return <section className={styles.surface} aria-label={props.ariaLabel || (typeof props.title === "string" ? props.title : undefined)}>
    {props.title || props.sub || props.headerActions ? <header><h3>{props.title}</h3>{props.sub ? <p>{props.sub}</p> : null}{props.headerActions ? <div className="row">{props.headerActions}</div> : null}</header> : null}
    <div className={props.bodyClass}>{props.children}</div>
    {props.footer ? <div className={styles.footer}>{props.footer}</div> : null}
  </section>;
}
