/**
 * Live demos for Intelligo's form controls and motion patterns:
 * checkboxes, radios and switches, disclosure and command lists, the
 * morphing popover, select and modal, notification stacks, animated lists,
 * one-time codes, uploads, expandable tabs and the hold-to-confirm button.
 * Every demo renders the installed registry source from
 * `@showcase/components/ui` with local state only — no network.
 */
import { useEffect, useState, type ReactNode } from "react";
import {
  BellIcon,
  ChevronsUpDownIcon,
  CreditCardIcon,
  FileTextIcon,
  HomeIcon,
  PlusIcon,
  ReceiptIcon,
  RotateCcwIcon,
  SettingsIcon,
  SlidersHorizontalIcon,
  SparklesIcon,
  Trash2Icon,
  UserPlusIcon,
  UsersIcon,
} from "lucide-react";

import {
  AnimatedList,
  AnimatedListItem,
} from "@showcase/components/ui/animated-list";
import { Button } from "@showcase/components/ui/button";
import { Checkbox } from "@showcase/components/ui/checkbox";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@showcase/components/ui/collapsible";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@showcase/components/ui/command";
import { ExpandableTabs } from "@showcase/components/ui/expandable-tabs";
import {
  FileUpload,
  createFileUploadItem,
  type FileUploadItem,
} from "@showcase/components/ui/file-upload";
import { HoldActionButton } from "@showcase/components/ui/hold-action-button";
import { Label } from "@showcase/components/ui/label";
import {
  MorphingModal,
  MorphingModalClose,
  MorphingModalContent,
  MorphingModalDescription,
  MorphingModalHeader,
  MorphingModalTitle,
  MorphingModalTrigger,
} from "@showcase/components/ui/morphing-modal";
import {
  NotificationStack,
  type NotificationStackItem,
} from "@showcase/components/ui/notification-stack";
import { OTPInput, type OTPStatus } from "@showcase/components/ui/otp-input";
import {
  MorphPopover,
  MorphPopoverClose,
  MorphPopoverContent,
  MorphPopoverDescription,
  MorphPopoverTitle,
  MorphPopoverTrigger,
} from "@showcase/components/ui/popover-morph";
import {
  RadioGroup,
  RadioGroupItem,
} from "@showcase/components/ui/radio-group";
import {
  MorphSelect,
  MorphSelectContent,
  MorphSelectGroup,
  MorphSelectItem,
  MorphSelectLabel,
  MorphSelectSeparator,
  MorphSelectTrigger,
  MorphSelectValue,
} from "@showcase/components/ui/select-morph";
import { Switch } from "@showcase/components/ui/switch";

/* ----------------------------------------------------------------------------
 * checkbox
 * ------------------------------------------------------------------------- */

function CheckboxDemo() {
  const [invoices, setInvoices] = useState(true);
  const [digest, setDigest] = useState(false);

  return (
    <div className="flex flex-col gap-3">
      <Label>
        <Checkbox checked={invoices} onCheckedChange={setInvoices} />
        Email me when an invoice is paid
      </Label>
      <Label>
        <Checkbox checked={digest} onCheckedChange={setDigest} />
        Send a weekly usage digest
      </Label>
      <Label>
        <Checkbox checked indeterminate />
        Some members selected
      </Label>
      <Label>
        <Checkbox disabled />
        Export audit log (Enterprise)
      </Label>
    </div>
  );
}

/* ----------------------------------------------------------------------------
 * radio-group
 * ------------------------------------------------------------------------- */

const ROLES = [
  { value: "admin", label: "Admin", hint: "Manages members and billing" },
  { value: "member", label: "Member", hint: "Uses the workspace" },
  { value: "viewer", label: "Viewer", hint: "Reads, never edits" },
];

function RadioGroupDemo() {
  const [role, setRole] = useState("member");

  return (
    <RadioGroup
      value={role}
      onValueChange={(next) => setRole(next as string)}
      aria-label="Member role"
      className="w-full max-w-xs gap-3"
    >
      {ROLES.map((item) => (
        <Label key={item.value} className="items-start">
          <RadioGroupItem value={item.value} className="mt-0.5" />
          <span className="flex flex-col gap-1">
            {item.label}
            <span className="text-xs font-normal text-muted-foreground">
              {item.hint}
            </span>
          </span>
        </Label>
      ))}
    </RadioGroup>
  );
}

/* ----------------------------------------------------------------------------
 * switch
 * ------------------------------------------------------------------------- */

function SwitchDemo() {
  const [autoTopUp, setAutoTopUp] = useState(true);
  const [alerts, setAlerts] = useState(false);

  return (
    <div className="flex w-full max-w-xs flex-col gap-4">
      <Label className="justify-between">
        Auto top-up credits
        <Switch checked={autoTopUp} onCheckedChange={setAutoTopUp} />
      </Label>
      <Label className="justify-between">
        Low-balance alerts
        <Switch size="sm" checked={alerts} onCheckedChange={setAlerts} />
      </Label>
    </div>
  );
}

/* ----------------------------------------------------------------------------
 * collapsible
 * ------------------------------------------------------------------------- */

function CollapsibleDemo() {
  return (
    <Collapsible className="flex w-full max-w-sm flex-col gap-2">
      <div className="flex items-center justify-between gap-4">
        <span className="text-sm font-medium">3 pending invitations</span>
        <CollapsibleTrigger
          render={
            <Button variant="ghost" size="icon-sm" aria-label="Toggle list" />
          }
        >
          <ChevronsUpDownIcon />
        </CollapsibleTrigger>
      </div>
      <div className="rounded-md border border-border px-3 py-2 text-sm">
        sara@example.com
      </div>
      <CollapsibleContent className="flex flex-col gap-2">
        <div className="rounded-md border border-border px-3 py-2 text-sm">
          lee@example.com
        </div>
        <div className="rounded-md border border-border px-3 py-2 text-sm">
          omar@example.com
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

/* ----------------------------------------------------------------------------
 * command
 * ------------------------------------------------------------------------- */

function CommandDemo() {
  return (
    <Command className="w-full max-w-sm border border-border shadow-md">
      <CommandInput placeholder="Search actions…" />
      <CommandList>
        <CommandEmpty>No matching actions.</CommandEmpty>
        <CommandGroup heading="Workspace">
          <CommandItem>
            <HomeIcon />
            Dashboard
            <CommandShortcut>⌘D</CommandShortcut>
          </CommandItem>
          <CommandItem>
            <UserPlusIcon />
            Invite a member
            <CommandShortcut>⌘I</CommandShortcut>
          </CommandItem>
          <CommandItem>
            <SparklesIcon />
            New chat
            <CommandShortcut>⌘K</CommandShortcut>
          </CommandItem>
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Billing">
          <CommandItem>
            <ReceiptIcon />
            View invoices
          </CommandItem>
          <CommandItem>
            <CreditCardIcon />
            Buy credits
          </CommandItem>
          <CommandItem>
            <SettingsIcon />
            Workspace settings
            <CommandShortcut>⌘,</CommandShortcut>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </Command>
  );
}

/* ----------------------------------------------------------------------------
 * popover-morph
 * ------------------------------------------------------------------------- */

function PopoverMorphDemo() {
  return (
    <MorphPopover>
      <MorphPopoverTrigger>
        <SlidersHorizontalIcon />
        Usage limit
      </MorphPopoverTrigger>
      <MorphPopoverContent align="start" className="flex w-64 flex-col gap-3">
        <div className="flex flex-col gap-1">
          <MorphPopoverTitle>Monthly credit cap</MorphPopoverTitle>
          <MorphPopoverDescription>
            Pause new runs once this workspace spends 50,000 credits.
          </MorphPopoverDescription>
        </div>
        <Label className="justify-between">
          Notify admins at 80%
          <Switch size="sm" defaultChecked />
        </Label>
        <MorphPopoverClose render={<Button size="sm" className="self-end" />}>
          Save
        </MorphPopoverClose>
      </MorphPopoverContent>
    </MorphPopover>
  );
}

/* ----------------------------------------------------------------------------
 * select-morph
 * ------------------------------------------------------------------------- */

const PLANS: Record<string, string> = {
  free: "Free",
  pro: "Pro",
  team: "Team",
  enterprise: "Enterprise",
};

function SelectMorphDemo() {
  const [plan, setPlan] = useState<string | null>("pro");

  return (
    <div className="flex w-full max-w-xs flex-col gap-2">
      <span className="text-sm font-medium">Plan</span>
      <MorphSelect items={PLANS} value={plan} onValueChange={setPlan}>
        <MorphSelectTrigger aria-label="Plan">
          <MorphSelectValue placeholder="Choose a plan" />
        </MorphSelectTrigger>
        <MorphSelectContent>
          <MorphSelectGroup>
            <MorphSelectLabel>Self-serve</MorphSelectLabel>
            <MorphSelectItem value="free">Free</MorphSelectItem>
            <MorphSelectItem value="pro">Pro</MorphSelectItem>
            <MorphSelectItem value="team">Team</MorphSelectItem>
          </MorphSelectGroup>
          <MorphSelectSeparator />
          <MorphSelectItem value="enterprise">Enterprise</MorphSelectItem>
        </MorphSelectContent>
      </MorphSelect>
    </div>
  );
}

/* ----------------------------------------------------------------------------
 * morphing-modal
 * ------------------------------------------------------------------------- */

function MorphingModalDemo() {
  return (
    <MorphingModal>
      <MorphingModalTrigger className="w-full max-w-xs">
        <span className="flex items-center gap-2 font-medium">
          <FileTextIcon className="size-4 text-muted-foreground" />
          Invoice INV-2041
        </span>
        <span className="text-muted-foreground">Paid · $240.00 · Sep 1</span>
      </MorphingModalTrigger>
      <MorphingModalContent>
        <MorphingModalHeader>
          <MorphingModalTitle>Invoice INV-2041</MorphingModalTitle>
          <MorphingModalDescription>
            Pro plan, billed monthly to this workspace.
          </MorphingModalDescription>
        </MorphingModalHeader>
        <dl className="grid grid-cols-2 gap-y-2 text-sm">
          <dt className="text-muted-foreground">Seats</dt>
          <dd className="text-right">8 × $25.00</dd>
          <dt className="text-muted-foreground">Credit bundle</dt>
          <dd className="text-right">$40.00</dd>
          <dt className="font-medium">Total</dt>
          <dd className="text-right font-medium">$240.00</dd>
        </dl>
        <MorphingModalClose render={<Button className="justify-self-end" />}>
          Done
        </MorphingModalClose>
      </MorphingModalContent>
    </MorphingModal>
  );
}

/* ----------------------------------------------------------------------------
 * notification-stack
 * ------------------------------------------------------------------------- */

const NOTIFICATIONS: NotificationStackItem[] = [
  {
    id: "n1",
    icon: <UserPlusIcon className="size-4" />,
    title: "Lee joined the workspace",
    description: "Accepted your invitation as a Member.",
    time: "2m",
    unread: true,
  },
  {
    id: "n2",
    icon: <ReceiptIcon className="size-4" />,
    title: "Invoice paid",
    description: "INV-2041 for $240.00 was charged to Visa ··4242.",
    time: "1h",
    unread: true,
  },
  {
    id: "n3",
    icon: <SparklesIcon className="size-4" />,
    title: "Credits running low",
    description: "12% of this month's credits remain.",
    time: "3h",
  },
  {
    id: "n4",
    icon: <BellIcon className="size-4" />,
    title: "Weekly digest ready",
    description: "142 runs, 3 new members, 1 failed export.",
    time: "1d",
  },
];

function NotificationStackDemo() {
  const [items, setItems] = useState(NOTIFICATIONS);

  return (
    <div className="flex w-full max-w-sm flex-col items-center gap-3">
      <NotificationStack
        items={items}
        onDismiss={(item) =>
          setItems((current) => current.filter((i) => i.id !== item.id))
        }
      />
      {items.length < NOTIFICATIONS.length ? (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setItems(NOTIFICATIONS)}
        >
          <RotateCcwIcon data-icon="inline-start" />
          Restore
        </Button>
      ) : null}
    </div>
  );
}

/* ----------------------------------------------------------------------------
 * animated-list
 * ------------------------------------------------------------------------- */

const MEMBERS = [
  { name: "Sara Kim", role: "Admin" },
  { name: "Lee Park", role: "Member" },
  { name: "Omar Haddad", role: "Member" },
];

const MORE_MEMBERS = [
  { name: "Ana Silva", role: "Viewer" },
  { name: "Jonas Berg", role: "Member" },
  { name: "Mia Chen", role: "Viewer" },
];

function AnimatedListDemo() {
  const [run, setRun] = useState(0);
  const [added, setAdded] = useState(0);
  const members = [...MEMBERS, ...MORE_MEMBERS.slice(0, added)];

  return (
    <div className="flex w-full max-w-sm flex-col gap-3">
      <AnimatedList key={run} className="flex flex-col gap-2">
        {members.map((member) => (
          <AnimatedListItem
            key={member.name}
            className="flex items-center gap-3 rounded-md border border-border px-3 py-2 text-sm"
          >
            <span className="grid size-7 place-items-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
              {member.name.charAt(0)}
            </span>
            <span className="flex-1 font-medium">{member.name}</span>
            <span className="text-xs text-muted-foreground">{member.role}</span>
          </AnimatedListItem>
        ))}
      </AnimatedList>
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={added >= MORE_MEMBERS.length}
          onClick={() => setAdded((count) => count + 1)}
        >
          <PlusIcon data-icon="inline-start" />
          Add member
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setAdded(0);
            setRun((count) => count + 1);
          }}
        >
          <RotateCcwIcon data-icon="inline-start" />
          Replay
        </Button>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------------------
 * otp-input
 * ------------------------------------------------------------------------- */

// The demo accepts one code; anything else shows the error state.
const DEMO_CODE = "424242";

function OTPInputDemo() {
  const [code, setCode] = useState("");
  const [status, setStatus] = useState<OTPStatus>("idle");

  return (
    <OTPInput
      length={6}
      value={code}
      status={status}
      onValueChange={(next) => {
        setCode(next);
        if (status !== "idle") setStatus("idle");
      }}
      onComplete={(next) => setStatus(next === DEMO_CODE ? "success" : "error")}
      labels={{
        label: "Verification code",
        hint: `Enter the code we emailed you (try ${DEMO_CODE}).`,
        error: "That code is not valid.",
        success: "Email verified.",
      }}
    />
  );
}

/* ----------------------------------------------------------------------------
 * file-upload
 * ------------------------------------------------------------------------- */

const INITIAL_FILES: FileUploadItem[] = [
  {
    id: "f1",
    name: "q3-invoices.csv",
    size: 184_320,
    type: "text/csv",
    status: "done",
  },
  {
    id: "f2",
    name: "member-handbook.pdf",
    size: 2_411_724,
    type: "application/pdf",
    status: "uploading",
    progress: 20,
  },
];

function FileUploadDemo() {
  const [files, setFiles] = useState(INITIAL_FILES);
  const uploading = files.some((item) => item.status === "uploading");

  // Advances every in-flight upload until it completes.
  useEffect(() => {
    if (!uploading) return;
    const timer = window.setInterval(() => {
      setFiles((current) =>
        current.map((item) => {
          if (item.status !== "uploading") return item;
          const progress = Math.min(100, (item.progress ?? 0) + 8);
          return progress >= 100
            ? { ...item, progress: 100, status: "done" }
            : { ...item, progress };
        })
      );
    }, 400);
    return () => window.clearInterval(timer);
  }, [uploading]);

  return (
    <FileUpload
      className="max-w-md"
      files={files}
      maxSize={10 * 1024 * 1024}
      onFilesAdded={(added) =>
        setFiles((current) => [...current, ...added.map(createFileUploadItem)])
      }
      onRemove={(item) =>
        setFiles((current) => current.filter((i) => i.id !== item.id))
      }
    />
  );
}

/* ----------------------------------------------------------------------------
 * expandable-tabs
 * ------------------------------------------------------------------------- */

const TABS = [
  { id: "home", label: "Home", icon: <HomeIcon className="size-4" /> },
  { id: "members", label: "Members", icon: <UsersIcon className="size-4" /> },
  {
    id: "billing",
    label: "Billing",
    icon: <CreditCardIcon className="size-4" />,
  },
  {
    id: "settings",
    label: "Settings",
    icon: <SettingsIcon className="size-4" />,
  },
];

function ExpandableTabsDemo() {
  return <ExpandableTabs items={TABS} aria-label="Workspace sections" />;
}

/* ----------------------------------------------------------------------------
 * hold-action-button
 * ------------------------------------------------------------------------- */

function HoldActionButtonDemo() {
  const [deleted, setDeleted] = useState(false);

  return (
    <div className="flex flex-col items-center gap-3">
      <HoldActionButton
        onConfirm={() => setDeleted(true)}
        labels={{ complete: "Deleted" }}
      >
        <Trash2Icon />
        Hold to delete workspace
      </HoldActionButton>
      <p className="text-sm text-muted-foreground" aria-live="polite">
        {deleted ? "Workspace scheduled for deletion." : "Press and hold."}
      </p>
      {deleted ? (
        <Button variant="ghost" size="sm" onClick={() => setDeleted(false)}>
          <RotateCcwIcon data-icon="inline-start" />
          Undo
        </Button>
      ) : null}
    </div>
  );
}

export const CONTROL_DEMOS: Record<string, () => ReactNode> = {
  checkbox: () => <CheckboxDemo />,
  "radio-group": () => <RadioGroupDemo />,
  switch: () => <SwitchDemo />,
  collapsible: () => <CollapsibleDemo />,
  command: () => <CommandDemo />,
  "popover-morph": () => <PopoverMorphDemo />,
  "select-morph": () => <SelectMorphDemo />,
  "morphing-modal": () => <MorphingModalDemo />,
  "notification-stack": () => <NotificationStackDemo />,
  "animated-list": () => <AnimatedListDemo />,
  "otp-input": () => <OTPInputDemo />,
  "file-upload": () => <FileUploadDemo />,
  "expandable-tabs": () => <ExpandableTabsDemo />,
  "hold-action-button": () => <HoldActionButtonDemo />,
};
