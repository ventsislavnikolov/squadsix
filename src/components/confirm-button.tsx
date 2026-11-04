import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useI18n } from "@/lib/i18n";

/**
 * A button whose action needs a second, deliberate yes. Replaces the browser's confirm(),
 * which can't be styled or translated and says the site's hostname instead of what happens.
 */
export function ConfirmButton({
  children,
  variant = "default",
  disabled,
  title,
  description,
  confirmLabel,
  onConfirm,
}: {
  children: React.ReactNode;
  variant?: React.ComponentProps<typeof Button>["variant"];
  disabled?: boolean;
  title: string;
  description: React.ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const confirm = useCallback(() => {
    setOpen(false);
    onConfirm();
  }, [onConfirm]);
  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger asChild>
        <Button disabled={disabled} variant={variant}>
          {children}
        </Button>
      </DialogTrigger>
      <DialogContent
        className="max-w-sm gap-6 border-fg/[0.1] bg-card"
        showCloseButton={false}
      >
        <DialogHeader>
          <DialogTitle className="text-[1.1rem] tracking-[-0.01em]">
            {title}
          </DialogTitle>
          <DialogDescription className="text-[13.5px] leading-[1.65] text-fg/60">
            {description}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2">
          <DialogClose asChild>
            <Button variant="ghost">{t.common.cancel}</Button>
          </DialogClose>
          <Button onClick={confirm}>{confirmLabel}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
