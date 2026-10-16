import { KeyRoundIcon, LogOutIcon } from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type AppBarProps = {
  school: { name: string; logoUrl?: string };
  /** Shown on every school page so nobody enters scores into the wrong term. */
  term: string;
  user: { name: string; role: string };
};

export function AppBar({ school, term, user }: AppBarProps) {
  return (
    <header className="border-b border-rule bg-card">
      <div className="mx-auto flex h-16 w-full max-w-5xl items-center gap-3 px-4 sm:px-6">
        <SchoolMark name={school.name} logoUrl={school.logoUrl} />
        <div className="flex min-w-0 flex-1 flex-col leading-tight">
          <span className="truncate font-bold">{school.name}</span>
          <span className="truncate type-caption text-muted-foreground">{term}</span>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button variant="ghost" size="icon" aria-label={`Account: ${user.name}`} />}
          >
            <Avatar className="size-9">
              <AvatarFallback className="bg-secondary font-bold text-secondary-foreground">
                {initials(user.name)}
              </AvatarFallback>
            </Avatar>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-56">
            <DropdownMenuGroup>
              <DropdownMenuLabel className="flex flex-col gap-0.5">
                <span className="text-base font-bold text-foreground">{user.name}</span>
                <span className="font-normal">{user.role}</span>
              </DropdownMenuLabel>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem>
                <KeyRoundIcon />
                Change password
              </DropdownMenuItem>
              <DropdownMenuItem>
                <LogOutIcon />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}

/** The school's own logo when it has one; otherwise its initials on a crest-like tile. */
export function SchoolMark({ name, logoUrl }: { name: string; logoUrl?: string }) {
  if (logoUrl) {
    // eslint-disable-next-line @next/next/no-img-element -- served by our own image route with caching
    return <img src={logoUrl} alt="" className="size-10 shrink-0 rounded-md object-contain" />;
  }
  return (
    <span
      aria-hidden="true"
      className="flex size-10 shrink-0 items-center justify-center rounded-md border-2 border-foreground/80 text-[0.8125rem] font-extrabold tracking-wide"
    >
      {initials(name)}
    </span>
  );
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter((word) => !/^(the|of|and|school|college|academy)$/i.test(word))
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase())
    .join("");
}
