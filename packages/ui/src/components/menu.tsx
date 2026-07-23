import { Menu as MenuPrimitive } from "@base-ui/react/menu";
import type { MenuItemProps, MenuPopupProps, MenuPositionerProps } from "@base-ui/react/menu";

import { cn } from "#lib/utils";

const MenuRoot = MenuPrimitive.Root;
const MenuTrigger = MenuPrimitive.Trigger;
const MenuPortal = MenuPrimitive.Portal;

function MenuPositioner({ className, sideOffset = 6, ...props }: MenuPositionerProps) {
  return (
    <MenuPrimitive.Positioner
      className={cn("z-60 outline-none", className)}
      sideOffset={sideOffset}
      {...props}
    />
  );
}

function MenuPopup({ className, ...props }: MenuPopupProps) {
  return (
    <MenuPrimitive.Popup
      className={cn(
        "min-w-48 rounded-xl border bg-popover p-1 text-popover-foreground shadow-xl outline-none transition-[scale,opacity] duration-100 data-ending-style:scale-[0.98] data-ending-style:opacity-0 data-starting-style:scale-[0.98] data-starting-style:opacity-0",
        className,
      )}
      {...props}
    />
  );
}

function MenuItem({ className, ...props }: MenuItemProps) {
  return (
    <MenuPrimitive.Item
      className={cn(
        "flex cursor-default items-center gap-2 rounded-lg px-3 py-2 text-sm outline-none select-none data-disabled:pointer-events-none data-disabled:opacity-50 data-highlighted:bg-muted data-highlighted:text-foreground",
        className,
      )}
      {...props}
    />
  );
}

export { MenuItem, MenuPopup, MenuPortal, MenuPositioner, MenuRoot, MenuTrigger };
