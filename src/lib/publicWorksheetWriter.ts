import { WorksheetSaveError } from "./worksheetApi";

/** Keep cell, row and explicit version writes in order within one open link. */
export class PublicWorksheetWriteQueue {
  private tail: Promise<unknown> = Promise.resolve();
  private conflict: WorksheetSaveError | null = null;

  run<T>(write: () => Promise<T>): Promise<T> {
    const result = this.tail.catch(() => undefined).then(async () => {
      if (this.conflict) throw this.conflict;
      try { return await write(); }
      catch (error) {
        if (error instanceof WorksheetSaveError && error.status === 409) this.conflict = error;
        throw error;
      }
    });
    this.tail = result;
    // Autosave callers may unmount; the original promise still rejects for flush.
    void result.catch(() => undefined);
    return result;
  }

  flush(): Promise<unknown> { return this.tail; }
}
