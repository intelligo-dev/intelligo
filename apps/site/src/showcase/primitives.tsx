/**
 * One live demo per catalog entry, built only from the base-nova
 * components installed in `@/components/ui` — exactly what `shadcn add`
 * gives a consumer — composed the way blocks compose them.
 */
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import {
  AlertCircleIcon,
  ArrowUpIcon,
  BellIcon,
  CheckCircle2Icon,
  ChevronRightIcon,
  FileTextIcon,
  HomeIcon,
  InboxIcon,
  LogOutIcon,
  MessageSquareIcon,
  PaperclipIcon,
  PlusIcon,
  SearchIcon,
  SettingsIcon,
  SparklesIcon,
  Trash2Icon,
  UserIcon,
  UsersIcon,
} from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Attachment,
  AttachmentContent,
  AttachmentDescription,
  AttachmentMedia,
  AttachmentTitle,
} from "@/components/ui/attachment";
import {
  Avatar,
  AvatarBadge,
  AvatarFallback,
  AvatarGroup,
  AvatarGroupCount,
} from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { Button } from "@/components/ui/button";
import {
  ButtonGroup,
  ButtonGroupSeparator,
} from "@/components/ui/button-group";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  InputGroupTextarea,
} from "@/components/ui/input-group";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { Label } from "@/components/ui/label";
import { Marker, MarkerContent, MarkerIcon } from "@/components/ui/marker";
import {
  Message,
  MessageAvatar,
  MessageContent,
  MessageFooter,
  MessageHeader,
} from "@/components/ui/message";
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@/components/ui/message-scroller";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { Toaster } from "@/components/ui/sonner";
import { Spinner } from "@/components/ui/spinner";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import type { ComponentName } from "@/lib/primitives";

const MEMBERS = [
  { id: "m1", name: "Maria Chen", email: "maria@acme.co", role: "owner" },
  { id: "m2", name: "Li Wei", email: "li@acme.co", role: "admin" },
  { id: "m3", name: "Sam Okafor", email: "sam@acme.co", role: "member" },
] as const;

const initials = (name: string) =>
  name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2);

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-2 sm:grid-cols-[88px_1fr] sm:items-center">
      <div className="font-mono text-xs text-muted-foreground">{label}</div>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

// ── T1 ────────────────────────────────────────────────────────────────

function AlertDemo() {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <Alert>
        <CheckCircle2Icon />
        <AlertTitle>Invitation sent</AlertTitle>
        <AlertDescription>
          Maria will get an email with a link to join.
        </AlertDescription>
      </Alert>
      <Alert variant="destructive">
        <AlertCircleIcon />
        <AlertTitle>Out of credits</AlertTitle>
        <AlertDescription>
          Buy a credit bundle or upgrade to keep running agents.
        </AlertDescription>
      </Alert>
    </div>
  );
}

function AlertDialogDemo() {
  return (
    <div className="flex flex-wrap gap-2">
      <AlertDialog>
        <AlertDialogTrigger render={<Button variant="destructive" />}>
          Delete conversation
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia>
              <Trash2Icon />
            </AlertDialogMedia>
            <AlertDialogTitle>Delete this conversation?</AlertDialogTitle>
            <AlertDialogDescription>
              Its messages and artifacts are removed. This can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog>
        <AlertDialogTrigger render={<Button variant="outline" />}>
          Leave workspace
        </AlertDialogTrigger>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Leave Acme Legal?</AlertDialogTitle>
            <AlertDialogDescription>
              You'll need a new invitation to come back.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Stay</AlertDialogCancel>
            <AlertDialogAction>Leave</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function AvatarDemo() {
  return (
    <div className="space-y-4">
      <Row label="size">
        <Avatar size="sm">
          <AvatarFallback>MC</AvatarFallback>
        </Avatar>
        <Avatar>
          <AvatarFallback>MC</AvatarFallback>
        </Avatar>
        <Avatar size="lg">
          <AvatarFallback>LW</AvatarFallback>
          <AvatarBadge className="bg-success" />
        </Avatar>
      </Row>
      <Row label="group">
        <AvatarGroup>
          {MEMBERS.map((m) => (
            <Avatar key={m.id}>
              <AvatarFallback>{initials(m.name)}</AvatarFallback>
            </Avatar>
          ))}
          <AvatarGroupCount>+4</AvatarGroupCount>
        </AvatarGroup>
      </Row>
    </div>
  );
}

function BadgeDemo() {
  return (
    <Row label="variant">
      <Badge>Owner</Badge>
      <Badge variant="secondary">Member</Badge>
      <Badge variant="outline">Pending</Badge>
      <Badge variant="destructive">Past due</Badge>
      <Badge variant="ghost">Ghost</Badge>
      <Badge variant="link">Link</Badge>
    </Row>
  );
}

function ButtonDemo() {
  return (
    <div className="space-y-4">
      <Row label="variant">
        <Button>Default</Button>
        <Button variant="secondary">Secondary</Button>
        <Button variant="outline">Outline</Button>
        <Button variant="ghost">Ghost</Button>
        <Button variant="destructive">Destructive</Button>
        <Button variant="link">Link</Button>
      </Row>
      <Row label="size">
        <Button size="xs">Extra small</Button>
        <Button size="sm">Small</Button>
        <Button>Default</Button>
        <Button size="lg">Large</Button>
      </Row>
      <Row label="icon">
        {(["icon-xs", "icon-sm", "icon", "icon-lg"] as const).map((size) => (
          <Button key={size} size={size} variant="outline" aria-label="Add">
            <PlusIcon />
          </Button>
        ))}
        <Button>
          <MessageSquareIcon data-icon="inline-start" /> New chat
        </Button>
        <Button disabled>Disabled</Button>
      </Row>
      <Row label="render">
        <Button
          render={<a href="#button" />}
          nativeButton={false}
          variant="outline"
        >
          A link that looks like a button
        </Button>
      </Row>
    </div>
  );
}

function CardDemo() {
  return (
    <Card className="max-w-md">
      <CardHeader>
        <CardTitle>Pro plan</CardTitle>
        <CardDescription>Renews on October 1, 2026.</CardDescription>
        <CardAction>
          <Badge variant="secondary">Active</Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Credits used</span>
          <span>1,226 / 5,000</span>
        </div>
        <Progress value={24} />
      </CardContent>
      <CardFooter className="gap-2">
        <Button size="sm">Manage billing</Button>
        <Button size="sm" variant="ghost">
          View usage
        </Button>
      </CardFooter>
    </Card>
  );
}

function DialogDemo() {
  return (
    <Dialog>
      <DialogTrigger render={<Button variant="outline" />}>
        Rename workspace
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Rename workspace</DialogTitle>
          <DialogDescription>
            Everyone in the workspace sees the new name.
          </DialogDescription>
        </DialogHeader>
        <Field>
          <FieldLabel htmlFor="dialog-name">Name</FieldLabel>
          <Input id="dialog-name" defaultValue="Acme Legal" />
        </Field>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>
            Cancel
          </DialogClose>
          <DialogClose render={<Button />}>Save</DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DropdownMenuDemo() {
  const [emails, setEmails] = useState(true);
  const [theme, setTheme] = useState("system");
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" />}>
        <Avatar size="sm">
          <AvatarFallback>MC</AvatarFallback>
        </Avatar>
        Maria Chen
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56" align="start">
        <DropdownMenuGroup>
          <DropdownMenuLabel>maria@acme.co</DropdownMenuLabel>
          <DropdownMenuItem>
            <UserIcon /> Profile <DropdownMenuShortcut>⌘P</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem>
            <SettingsIcon /> Settings{" "}
            <DropdownMenuShortcut>⌘,</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuCheckboxItem
            checked={emails}
            onCheckedChange={setEmails}
          >
            Email notifications
          </DropdownMenuCheckboxItem>
        </DropdownMenuGroup>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>Theme</DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuRadioGroup value={theme} onValueChange={setTheme}>
              <DropdownMenuRadioItem value="light">Light</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="dark">Dark</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="system">
                System
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive">
          <LogOutIcon /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const ROLES = [
  { label: "Owner", value: "owner" },
  { label: "Admin", value: "admin" },
  { label: "Member", value: "member" },
];

function FormControls({ id }: { id: string }) {
  return (
    <FieldGroup className="max-w-xl sm:grid sm:grid-cols-2">
      <Field>
        <Label htmlFor={`${id}-name`}>Workspace name</Label>
        <Input id={`${id}-name`} defaultValue="Acme Legal" />
      </Field>
      <Field>
        <Label htmlFor={`${id}-slug`}>Slug</Label>
        <Input id={`${id}-slug`} defaultValue="acme-legal" disabled />
      </Field>
      <Field className="sm:col-span-2">
        <Label htmlFor={`${id}-note`}>Message</Label>
        <Textarea
          id={`${id}-note`}
          placeholder="Summarise the indemnity clauses in this contract…"
        />
      </Field>
    </FieldGroup>
  );
}

function PopoverDemo() {
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button variant="outline" size="icon" aria-label="Notifications" />
        }
      >
        <BellIcon />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72">
        <PopoverHeader>
          <PopoverTitle>Notifications</PopoverTitle>
          <PopoverDescription>Maria Chen joined Acme Legal.</PopoverDescription>
        </PopoverHeader>
      </PopoverContent>
    </Popover>
  );
}

function ProgressDemo() {
  return (
    <div className="grid max-w-md gap-4">
      {(
        [
          ["Credits", 24],
          ["Seats", 60],
          ["Storage", 92],
        ] as const
      ).map(([label, value]) => (
        <div key={label} className="grid gap-1.5">
          <div className="flex justify-between text-sm">
            <span>{label}</span>
            <span className="text-muted-foreground">{value}%</span>
          </div>
          <Progress value={value} />
        </div>
      ))}
    </div>
  );
}

function ScrollAreaDemo() {
  return (
    <ScrollArea className="h-48 w-full max-w-xs rounded-md border">
      <div className="p-3">
        <div className="mb-2 text-sm font-medium">Conversations</div>
        {Array.from({ length: 16 }, (_, i) => (
          <div key={i}>
            <div className="py-1.5 text-sm text-muted-foreground">
              Contract review #{16 - i}
            </div>
            {i < 15 && <Separator />}
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}

function SelectDemo() {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Select items={ROLES} defaultValue="member">
        <SelectTrigger className="w-40" aria-label="Role">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {ROLES.map((role) => (
              <SelectItem key={role.value} value={role.value}>
                {role.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      <Select items={ROLES} defaultValue="admin">
        <SelectTrigger size="sm" className="w-40" aria-label="Role (small)">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {ROLES.map((role) => (
              <SelectItem key={role.value} value={role.value}>
                {role.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </div>
  );
}

function SeparatorDemo() {
  return (
    <div className="max-w-sm">
      <div className="text-sm font-medium">Acme Legal</div>
      <div className="text-sm text-muted-foreground">Pro plan · 3 members</div>
      <Separator className="my-3" />
      <div className="flex h-5 items-center gap-3 text-sm">
        <span>Team</span>
        <Separator orientation="vertical" />
        <span>Billing</span>
        <Separator orientation="vertical" />
        <span>Usage</span>
      </div>
    </div>
  );
}

function SheetDemo() {
  return (
    <div className="flex flex-wrap gap-2">
      {(["top", "right", "bottom", "left"] as const).map((side) => (
        <Sheet key={side}>
          <SheetTrigger
            render={<Button variant="outline" className="capitalize" />}
          >
            {side}
          </SheetTrigger>
          <SheetContent side={side}>
            <SheetHeader>
              <SheetTitle>Execution details</SheetTitle>
              <SheetDescription>
                claude-sonnet-5 · 14 credits · 2.4s
              </SheetDescription>
            </SheetHeader>
            <SheetFooter>
              <SheetClose render={<Button variant="outline" />}>
                Close
              </SheetClose>
            </SheetFooter>
          </SheetContent>
        </Sheet>
      ))}
    </div>
  );
}

function SidebarDemo() {
  const items = [
    { icon: HomeIcon, label: "Dashboard", active: true },
    { icon: MessageSquareIcon, label: "Chat", badge: "3" },
    { icon: UsersIcon, label: "Team" },
    { icon: SettingsIcon, label: "Settings" },
  ];
  return (
    // translate-z-0 makes the sidebar's fixed container resolve against this box.
    <div className="showcase-canvas relative h-80 translate-z-0 overflow-hidden rounded-lg border">
      <SidebarProvider className="h-full min-h-0">
        <Sidebar collapsible="icon">
          <SidebarHeader>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton size="lg">
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground group-data-[collapsible=icon]:size-4">
                    A
                  </div>
                  <div className="grid text-left text-sm leading-tight group-data-[collapsible=icon]:hidden">
                    <span className="truncate font-medium">Acme Legal</span>
                    <span className="truncate text-xs text-muted-foreground">
                      Pro
                    </span>
                  </div>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarHeader>
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel>Workspace</SidebarGroupLabel>
              <SidebarMenu>
                {items.map((it) => (
                  <SidebarMenuItem key={it.label}>
                    <SidebarMenuButton isActive={it.active} tooltip={it.label}>
                      <it.icon />
                      <span>{it.label}</span>
                    </SidebarMenuButton>
                    {it.badge && (
                      <SidebarMenuBadge>{it.badge}</SidebarMenuBadge>
                    )}
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroup>
          </SidebarContent>
          <SidebarFooter>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton tooltip="Maria Chen">
                  <UserIcon />
                  <span>Maria Chen</span>
                  <ChevronRightIcon className="ml-auto group-data-[collapsible=icon]:hidden" />
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarFooter>
        </Sidebar>
        <SidebarInset className="min-h-0">
          <header className="flex h-12 items-center gap-2 border-b px-3">
            <SidebarTrigger />
            <Separator orientation="vertical" className="h-4" />
            <span className="text-sm font-medium">Dashboard</span>
          </header>
          <div className="grid flex-1 gap-3 p-4 sm:grid-cols-3">
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
          </div>
        </SidebarInset>
      </SidebarProvider>
    </div>
  );
}

function SkeletonDemo() {
  return (
    <div className="flex max-w-sm items-center gap-3" aria-busy="true">
      <Skeleton className="size-10 rounded-full" />
      <div className="grid flex-1 gap-2">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
      </div>
    </div>
  );
}

function SonnerDemo() {
  return (
    <div className="flex flex-wrap gap-2">
      <Button
        variant="outline"
        onClick={() => toast.success("Invitation sent to maria@acme.co")}
      >
        Success
      </Button>
      <Button
        variant="outline"
        onClick={() => toast.warning("You have 120 credits left")}
      >
        Warning
      </Button>
      <Button
        variant="outline"
        onClick={() => toast.error("The payment was declined")}
      >
        Error
      </Button>
      <Toaster position="bottom-right" />
    </div>
  );
}

function TableDemo() {
  return (
    <Table>
      <TableCaption>Members of Acme Legal.</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Email</TableHead>
          <TableHead className="text-right">Role</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {MEMBERS.map((m) => (
          <TableRow key={m.id}>
            <TableCell className="font-medium">{m.name}</TableCell>
            <TableCell className="text-muted-foreground">{m.email}</TableCell>
            <TableCell className="text-right">
              <Badge variant={m.role === "owner" ? "default" : "secondary"}>
                {m.role}
              </Badge>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function TabsDemo() {
  return (
    <div className="grid gap-6 md:grid-cols-2">
      {(["default", "line"] as const).map((variant) => (
        <Tabs key={variant} defaultValue="profile">
          <TabsList variant={variant}>
            <TabsTrigger value="profile">Profile</TabsTrigger>
            <TabsTrigger value="team">Team</TabsTrigger>
            <TabsTrigger value="billing">Billing</TabsTrigger>
          </TabsList>
          {["profile", "team", "billing"].map((v) => (
            <TabsContent
              key={v}
              value={v}
              className="pt-2 text-sm text-muted-foreground"
            >
              variant="{variant}" · {v} settings
            </TabsContent>
          ))}
        </Tabs>
      ))}
    </div>
  );
}

function TooltipDemo() {
  const items = [
    { Icon: PlusIcon, label: "New conversation", keys: ["⌘", "K"] },
    { Icon: BellIcon, label: "Notifications", keys: [] },
    { Icon: SettingsIcon, label: "Settings", keys: ["⌘", ","] },
  ];
  return (
    <div className="flex gap-2">
      {items.map(({ Icon, label, keys }) => (
        <Tooltip key={label}>
          <TooltipTrigger
            render={<Button variant="outline" size="icon" aria-label={label} />}
          >
            <Icon />
          </TooltipTrigger>
          <TooltipContent>
            {label}
            {keys.length > 0 && (
              <KbdGroup>
                {keys.map((k) => (
                  <Kbd key={k}>{k}</Kbd>
                ))}
              </KbdGroup>
            )}
          </TooltipContent>
        </Tooltip>
      ))}
    </div>
  );
}

// ── T2 ────────────────────────────────────────────────────────────────

function FieldDemo() {
  return (
    <form className="max-w-md" onSubmit={(e) => e.preventDefault()}>
      <FieldSet>
        <FieldLegend>Invite a teammate</FieldLegend>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="field-email">Email</FieldLabel>
            <Input
              id="field-email"
              type="email"
              placeholder="name@company.com"
            />
            <FieldDescription>
              They get a link that expires in 7 days.
            </FieldDescription>
          </Field>
          <Field data-invalid>
            <FieldLabel htmlFor="field-seats">Seats</FieldLabel>
            <Input id="field-seats" defaultValue="12" aria-invalid />
            <FieldError>Your plan includes 10 seats.</FieldError>
          </Field>
          <Field orientation="horizontal">
            <Button type="submit">Send invitation</Button>
            <Button variant="outline" type="button">
              Cancel
            </Button>
          </Field>
        </FieldGroup>
      </FieldSet>
    </form>
  );
}

function EmptyDemo() {
  return (
    <Empty className="border border-dashed">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <InboxIcon />
        </EmptyMedia>
        <EmptyTitle>No artifacts yet</EmptyTitle>
        <EmptyDescription>
          Documents your agent writes in chat show up here.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button size="sm">
          <MessageSquareIcon data-icon="inline-start" /> Start a conversation
        </Button>
      </EmptyContent>
    </Empty>
  );
}

function ItemDemo() {
  return (
    <ItemGroup className="max-w-lg gap-2">
      <Item variant="outline">
        <ItemMedia variant="icon">
          <FileTextIcon />
        </ItemMedia>
        <ItemContent>
          <ItemTitle>Indemnity summary</ItemTitle>
          <ItemDescription>
            Generated in “Contract review #16” · 2 hours ago
          </ItemDescription>
        </ItemContent>
        <ItemActions>
          <Button size="sm" variant="outline">
            Open
          </Button>
        </ItemActions>
      </Item>
      <Item variant="muted" size="sm">
        <ItemContent>
          <ItemTitle>Two-factor authentication</ItemTitle>
          <ItemDescription>Required for owners and admins.</ItemDescription>
        </ItemContent>
        <ItemActions>
          <Badge variant="secondary">On</Badge>
        </ItemActions>
      </Item>
    </ItemGroup>
  );
}

function InputGroupDemo() {
  return (
    <div className="grid max-w-md gap-3">
      <InputGroup>
        <InputGroupAddon>
          <SearchIcon />
        </InputGroupAddon>
        <InputGroupInput
          placeholder="Search conversations"
          aria-label="Search conversations"
        />
        <InputGroupAddon align="inline-end">
          <KbdGroup>
            <Kbd>⌘</Kbd>
            <Kbd>K</Kbd>
          </KbdGroup>
        </InputGroupAddon>
      </InputGroup>
      <InputGroup>
        <InputGroupTextarea
          placeholder="Ask about this contract…"
          aria-label="Message"
        />
        <InputGroupAddon align="block-end">
          <InputGroupButton
            size="icon-xs"
            variant="ghost"
            aria-label="Attach a file"
          >
            <PaperclipIcon />
          </InputGroupButton>
          <InputGroupButton
            size="icon-xs"
            variant="default"
            className="ml-auto rounded-full"
            aria-label="Send"
          >
            <ArrowUpIcon />
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
    </div>
  );
}

function ButtonGroupDemo() {
  return (
    <ButtonGroup>
      <Button variant="outline">Day</Button>
      <Button variant="outline">Week</Button>
      <Button variant="outline">Month</Button>
      <ButtonGroupSeparator />
      <Button variant="outline" size="icon" aria-label="Export">
        <FileTextIcon />
      </Button>
    </ButtonGroup>
  );
}

function SpinnerDemo() {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button disabled aria-busy="true">
        <Spinner data-icon="inline-start" /> Saving
      </Button>
      <Button variant="outline" disabled aria-busy="true">
        <Spinner data-icon="inline-start" /> Sending invitation
      </Button>
      <Spinner className="size-6 text-muted-foreground" aria-label="Loading" />
    </div>
  );
}

function KbdDemo() {
  return (
    <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
      <span className="flex items-center gap-2">
        New chat
        <KbdGroup>
          <Kbd>⌘</Kbd>
          <Kbd>K</Kbd>
        </KbdGroup>
      </span>
      <span className="flex items-center gap-2">
        Send <Kbd>Enter</Kbd>
      </span>
      <span className="flex items-center gap-2">
        New line
        <KbdGroup>
          <Kbd>Shift</Kbd>
          <Kbd>Enter</Kbd>
        </KbdGroup>
      </span>
    </div>
  );
}

const TURNS = [
  {
    id: "t1",
    from: "user",
    text: "Summarise the indemnity clauses in the Acme MSA.",
  },
  {
    id: "t2",
    from: "agent",
    text: "There are three: a mutual IP indemnity (§9.1), a data-breach indemnity capped at 12 months of fees (§9.3), and a carve-out for gross negligence (§9.4).",
  },
  { id: "t3", from: "user", text: "Is the data-breach cap market standard?" },
  {
    id: "t4",
    from: "agent",
    text: "For a mid-market SaaS contract, 12 months is on the low side; 24 months or a separate super-cap for data incidents is more common.",
  },
] as const;

function Conversation({ turns }: { turns: readonly (typeof TURNS)[number][] }) {
  return (
    <MessageScrollerProvider>
      <MessageScroller className="h-72 rounded-lg border">
        <MessageScrollerViewport>
          <MessageScrollerContent className="p-4">
            <Marker variant="separator">
              <MarkerContent>Today</MarkerContent>
            </Marker>
            {turns.map((turn) => (
              <MessageScrollerItem key={turn.id} messageId={turn.id}>
                <Message align={turn.from === "user" ? "end" : "start"}>
                  {turn.from === "agent" && (
                    <MessageAvatar>
                      <SparklesIcon />
                    </MessageAvatar>
                  )}
                  <MessageContent>
                    {turn.from === "agent" && (
                      <MessageHeader>Contract Copilot</MessageHeader>
                    )}
                    <Bubble
                      variant={turn.from === "user" ? "default" : "ghost"}
                      align={turn.from === "user" ? "end" : "start"}
                    >
                      <BubbleContent>{turn.text}</BubbleContent>
                    </Bubble>
                    {turn.from === "agent" && (
                      <MessageFooter>14 credits</MessageFooter>
                    )}
                  </MessageContent>
                </Message>
              </MessageScrollerItem>
            ))}
            <Marker>
              <MarkerIcon>
                <Spinner />
              </MarkerIcon>
              <MarkerContent>Thinking…</MarkerContent>
            </Marker>
          </MessageScrollerContent>
        </MessageScrollerViewport>
        <MessageScrollerButton />
      </MessageScroller>
    </MessageScrollerProvider>
  );
}

function MessageScrollerDemo() {
  return <Conversation turns={TURNS} />;
}

function MessageDemo() {
  return (
    <div className="grid max-w-xl gap-4">
      <Message align="end">
        <MessageContent>
          <Bubble align="end">
            <BubbleContent>
              Draft a reply accepting the 24-month cap.
            </BubbleContent>
          </Bubble>
        </MessageContent>
      </Message>
      <Message>
        <MessageAvatar>
          <SparklesIcon />
        </MessageAvatar>
        <MessageContent>
          <MessageHeader>Contract Copilot</MessageHeader>
          <Bubble variant="muted">
            <BubbleContent>
              Here is a reply you can send to Acme's counsel.
            </BubbleContent>
          </Bubble>
          <MessageFooter>claude-sonnet-5 · 22 credits</MessageFooter>
        </MessageContent>
      </Message>
    </div>
  );
}

function BubbleDemo() {
  return (
    <div className="grid max-w-xl gap-2">
      {(["default", "secondary", "muted", "outline", "ghost"] as const).map(
        (variant, i) => (
          <Bubble
            key={variant}
            variant={variant}
            align={i % 2 ? "end" : "start"}
          >
            <BubbleContent>variant="{variant}"</BubbleContent>
          </Bubble>
        )
      )}
    </div>
  );
}

function AttachmentDemo() {
  return (
    <div className="flex flex-wrap gap-3">
      <Attachment>
        <AttachmentMedia variant="icon">
          <FileTextIcon />
        </AttachmentMedia>
        <AttachmentContent>
          <AttachmentTitle>acme-msa.pdf</AttachmentTitle>
          <AttachmentDescription>2.4 MB</AttachmentDescription>
        </AttachmentContent>
      </Attachment>
      <Attachment size="sm">
        <AttachmentMedia variant="icon">
          <Spinner />
        </AttachmentMedia>
        <AttachmentContent>
          <AttachmentTitle>redlines.docx</AttachmentTitle>
          <AttachmentDescription>Uploading…</AttachmentDescription>
        </AttachmentContent>
      </Attachment>
    </div>
  );
}

function MarkerDemo() {
  return (
    <div className="grid max-w-md gap-3">
      <Marker variant="separator">
        <MarkerContent>Yesterday</MarkerContent>
      </Marker>
      <Marker>
        <MarkerIcon>
          <Spinner />
        </MarkerIcon>
        <MarkerContent>Reading acme-msa.pdf…</MarkerContent>
      </Marker>
      <Marker>
        <MarkerIcon>
          <CheckCircle2Icon className="text-success" />
        </MarkerIcon>
        <MarkerContent>Saved as an artifact</MarkerContent>
      </Marker>
    </div>
  );
}

const DEMOS: Record<ComponentName, () => ReactNode> = {
  alert: AlertDemo,
  "alert-dialog": AlertDialogDemo,
  avatar: AvatarDemo,
  badge: BadgeDemo,
  button: ButtonDemo,
  card: CardDemo,
  dialog: DialogDemo,
  "dropdown-menu": DropdownMenuDemo,
  input: () => <FormControls id="input" />,
  label: () => <FormControls id="label" />,
  popover: PopoverDemo,
  progress: ProgressDemo,
  "scroll-area": ScrollAreaDemo,
  select: SelectDemo,
  separator: SeparatorDemo,
  sheet: SheetDemo,
  sidebar: SidebarDemo,
  skeleton: SkeletonDemo,
  sonner: SonnerDemo,
  table: TableDemo,
  tabs: TabsDemo,
  textarea: () => <FormControls id="textarea" />,
  tooltip: TooltipDemo,
  field: FieldDemo,
  empty: EmptyDemo,
  item: ItemDemo,
  "input-group": InputGroupDemo,
  "button-group": ButtonGroupDemo,
  spinner: SpinnerDemo,
  kbd: KbdDemo,
  "message-scroller": MessageScrollerDemo,
  message: MessageDemo,
  bubble: BubbleDemo,
  attachment: AttachmentDemo,
  marker: MarkerDemo,
};

export function PrimitiveDemo({ name }: { name: ComponentName }) {
  const Demo = DEMOS[name];
  return (
    <TooltipProvider>
      <div className="rounded-lg border bg-background p-5 text-foreground md:p-6">
        <Demo />
      </div>
    </TooltipProvider>
  );
}
