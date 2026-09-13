/**
 * One live demo per primitive, built only from the reference app's own
 * `components/ui/*` (synced to `@showcase/components/ui`). What renders
 * here is exactly what `shadcn add` gives a consumer.
 */
import { useState, type ReactNode } from "react";
import {
  AlertCircle,
  Bell,
  CheckCircle2,
  ChevronRight,
  Home,
  LogOut,
  MessageSquare,
  Plus,
  Settings,
  Trash2,
  User,
  Users,
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
} from "@showcase/components/ui/alert-dialog";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@showcase/components/ui/alert";
import {
  Avatar,
  AvatarBadge,
  AvatarFallback,
  AvatarGroup,
  AvatarGroupCount,
} from "@showcase/components/ui/avatar";
import { Badge } from "@showcase/components/ui/badge";
import { Button } from "@showcase/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@showcase/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@showcase/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
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
} from "@showcase/components/ui/dropdown-menu";
import { Input } from "@showcase/components/ui/input";
import { Label } from "@showcase/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@showcase/components/ui/popover";
import { Progress } from "@showcase/components/ui/progress";
import { ScrollArea } from "@showcase/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@showcase/components/ui/select";
import { Separator } from "@showcase/components/ui/separator";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@showcase/components/ui/sheet";
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
} from "@showcase/components/ui/sidebar";
import { Skeleton } from "@showcase/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@showcase/components/ui/table";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@showcase/components/ui/tabs";
import { Textarea } from "@showcase/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@showcase/components/ui/tooltip";

import type { PrimitiveName } from "@/lib/primitives";
import { MEMBERS } from "./fixtures";

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-2 sm:grid-cols-[88px_1fr] sm:items-center">
      <div className="font-mono text-[0.7rem] text-muted-foreground">
        {label}
      </div>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

const initials = (name: string) =>
  name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

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
        <Button size="icon-xs" variant="outline" aria-label="Add">
          <Plus />
        </Button>
        <Button size="icon-sm" variant="outline" aria-label="Add">
          <Plus />
        </Button>
        <Button size="icon" variant="outline" aria-label="Add">
          <Plus />
        </Button>
        <Button size="icon-lg" variant="outline" aria-label="Add">
          <Plus />
        </Button>
        <Button>
          <MessageSquare /> New chat
        </Button>
        <Button disabled>Disabled</Button>
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
      <Badge variant="secondary">
        <CheckCircle2 /> Active
      </Badge>
    </Row>
  );
}

function AlertDemo() {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <Alert>
        <CheckCircle2 />
        <AlertTitle>Invitation sent</AlertTitle>
        <AlertDescription>
          Maria will get an email with a link to join the workspace.
        </AlertDescription>
      </Alert>
      <Alert variant="destructive">
        <AlertCircle />
        <AlertTitle>Out of credits</AlertTitle>
        <AlertDescription>
          Buy a credit bundle or upgrade your plan to keep running agents.
        </AlertDescription>
      </Alert>
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
          <AvatarFallback>MC</AvatarFallback>
        </Avatar>
        <Avatar size="lg">
          <AvatarFallback>LW</AvatarFallback>
          <AvatarBadge className="bg-emerald-500" />
        </Avatar>
      </Row>
      <Row label="group">
        <AvatarGroup>
          {MEMBERS.map((m) => (
            <Avatar key={m.id}>
              <AvatarFallback>{initials(m.user?.name ?? "")}</AvatarFallback>
            </Avatar>
          ))}
          <AvatarGroupCount>+4</AvatarGroupCount>
        </AvatarGroup>
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

function FieldsDemo({
  focus,
}: {
  focus: "input" | "label" | "textarea" | "select";
}) {
  return (
    <div className="grid max-w-xl gap-4 sm:grid-cols-2">
      <div className="grid gap-2">
        <Label htmlFor={`${focus}-name`}>Workspace name</Label>
        <Input id={`${focus}-name`} defaultValue="Acme Legal" />
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`${focus}-email`}>Invite by email</Label>
        <Input
          id={`${focus}-email`}
          type="email"
          placeholder="name@company.com"
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`${focus}-role`}>Role</Label>
        <Select defaultValue="member">
          <SelectTrigger id={`${focus}-role`} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectLabel>Role</SelectLabel>
              <SelectItem value="owner">Owner</SelectItem>
              <SelectItem value="admin">Admin</SelectItem>
              <SelectItem value="member">Member</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`${focus}-disabled`}>Slug</Label>
        <Input id={`${focus}-disabled`} defaultValue="acme-legal" disabled />
      </div>
      <div className="grid gap-2 sm:col-span-2">
        <Label htmlFor={`${focus}-note`}>Message</Label>
        <Textarea
          id={`${focus}-note`}
          placeholder="Summarise the indemnity clauses in this contract…"
        />
      </div>
    </div>
  );
}

function DialogDemo() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline">Rename workspace</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Rename workspace</DialogTitle>
          <DialogDescription>
            Everyone in the workspace sees the new name.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          <Label htmlFor="dialog-name">Name</Label>
          <Input id="dialog-name" defaultValue="Acme Legal" />
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <DialogClose asChild>
            <Button>Save</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AlertDialogDemo() {
  return (
    <div className="flex flex-wrap gap-2">
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="destructive">Delete conversation</Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia>
              <Trash2 />
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
        <AlertDialogTrigger asChild>
          <Button variant="outline">Leave workspace (sm)</Button>
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

function DropdownMenuDemo() {
  const [emails, setEmails] = useState(true);
  const [theme, setTheme] = useState("system");
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline">
          <Avatar size="sm">
            <AvatarFallback>MC</AvatarFallback>
          </Avatar>
          Maria Chen
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56" align="start">
        <DropdownMenuLabel>maria@acme.co</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem>
          <User /> Profile <DropdownMenuShortcut>⌘P</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem>
          <Settings /> Settings <DropdownMenuShortcut>⌘,</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuCheckboxItem checked={emails} onCheckedChange={setEmails}>
          Email notifications
        </DropdownMenuCheckboxItem>
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
          <LogOut /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function PopoverDemo() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="icon" aria-label="Notifications">
          <Bell />
        </Button>
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
      {[
        ["Credits", 24],
        ["Seats", 60],
        ["Storage", 92],
      ].map(([label, value]) => (
        <div key={label} className="grid gap-1.5">
          <div className="flex justify-between text-sm">
            <span>{label}</span>
            <span className="text-muted-foreground">{value}%</span>
          </div>
          <Progress value={value as number} />
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
      <Select defaultValue="30d">
        <SelectTrigger className="w-40">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="7d">Last 7 days</SelectItem>
          <SelectItem value="30d">Last 30 days</SelectItem>
          <SelectItem value="90d">Last 90 days</SelectItem>
        </SelectContent>
      </Select>
      <Select>
        <SelectTrigger size="sm" className="w-40">
          <SelectValue placeholder="Pick a role (sm)" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="admin">Admin</SelectItem>
          <SelectItem value="member">Member</SelectItem>
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
  const sides = ["top", "right", "bottom", "left"] as const;
  return (
    <div className="flex flex-wrap gap-2">
      {sides.map((side) => (
        <Sheet key={side}>
          <SheetTrigger asChild>
            <Button variant="outline" className="capitalize">
              {side}
            </Button>
          </SheetTrigger>
          <SheetContent side={side}>
            <SheetHeader>
              <SheetTitle>Execution details</SheetTitle>
              <SheetDescription>
                claude-sonnet-5 · 14 credits · 2.4s
              </SheetDescription>
            </SheetHeader>
            <SheetFooter>
              <SheetClose asChild>
                <Button variant="outline">Close</Button>
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
    { icon: Home, label: "Dashboard", active: true },
    { icon: MessageSquare, label: "Chat", badge: "3" },
    { icon: Users, label: "Team" },
    { icon: Settings, label: "Settings" },
  ];
  return (
    // translateZ(0) makes the sidebar's fixed container resolve against this box.
    <div className="showcase-canvas relative h-80 overflow-hidden rounded-lg border [transform:translateZ(0)]">
      <SidebarProvider className="h-full min-h-0">
        <Sidebar collapsible="icon">
          <SidebarHeader>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton size="lg">
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground group-data-[collapsible=icon]:size-4 group-data-[collapsible=icon]:text-[0.55rem]">
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
                  <User />
                  <span>Maria Chen</span>
                  <ChevronRight className="ml-auto group-data-[collapsible=icon]:hidden" />
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
    <div className="flex max-w-sm items-center gap-3">
      <Skeleton className="size-10 rounded-full" />
      <div className="grid flex-1 gap-2">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
      </div>
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
            <TableCell className="font-medium">{m.user?.name}</TableCell>
            <TableCell className="text-muted-foreground">
              {m.user?.email}
            </TableCell>
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
              <span className="font-mono text-[0.7rem]">
                variant="{variant}"
              </span>{" "}
              · {v} settings
            </TabsContent>
          ))}
        </Tabs>
      ))}
    </div>
  );
}

function TooltipDemo() {
  return (
    <div className="flex gap-2">
      {[
        [Plus, "New conversation"],
        [Bell, "Notifications"],
        [Settings, "Settings"],
      ].map(([Icon, label]) => {
        const I = Icon as typeof Plus;
        return (
          <Tooltip key={label as string}>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                aria-label={label as string}
              >
                <I />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{label as string}</TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}

const DEMOS: Record<PrimitiveName, () => ReactNode> = {
  "alert-dialog": AlertDialogDemo,
  alert: AlertDemo,
  avatar: AvatarDemo,
  badge: BadgeDemo,
  button: ButtonDemo,
  card: CardDemo,
  dialog: DialogDemo,
  "dropdown-menu": DropdownMenuDemo,
  input: () => <FieldsDemo focus="input" />,
  label: () => <FieldsDemo focus="label" />,
  popover: PopoverDemo,
  progress: ProgressDemo,
  "scroll-area": ScrollAreaDemo,
  select: SelectDemo,
  separator: SeparatorDemo,
  sheet: SheetDemo,
  sidebar: SidebarDemo,
  skeleton: SkeletonDemo,
  table: TableDemo,
  tabs: TabsDemo,
  textarea: () => <FieldsDemo focus="textarea" />,
  tooltip: TooltipDemo,
};

export function PrimitiveDemo({ name }: { name: PrimitiveName }) {
  const Demo = DEMOS[name];
  return (
    <TooltipProvider>
      <div className="rounded-lg border border-line bg-background p-5 text-foreground md:p-6">
        <Demo />
      </div>
    </TooltipProvider>
  );
}
