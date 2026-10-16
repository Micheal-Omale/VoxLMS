"use client";

import Link from "next/link";
import { useTransition } from "react";
import { ArrowLeftRightIcon, KeyRoundIcon, LogOutIcon } from "lucide-react";

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
import { signOutAction } from "@/server/auth/actions";

export function AccountMenu({
  name,
  detail,
  canSwitchSchool,
  readOnly,
}: {
  name: string;
  detail: string;
  canSwitchSchool: boolean;
  readOnly: boolean;
}) {
  const [pending, start] = useTransition();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="icon" aria-label={`Account: ${name}`} />}>
        <Avatar className="size-9">
          <AvatarFallback className="bg-secondary font-bold text-secondary-foreground">{initials(name)}</AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-60">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="flex flex-col gap-0.5">
            <span className="text-base font-bold text-foreground">{name}</span>
            <span className="font-normal">{detail}</span>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          {canSwitchSchool && (
            <DropdownMenuItem render={<Link href="/choose-school" />}>
              <ArrowLeftRightIcon />
              Switch school
            </DropdownMenuItem>
          )}
          {!readOnly && (
            <DropdownMenuItem render={<Link href="/account/password" />}>
              <KeyRoundIcon />
              Change password
            </DropdownMenuItem>
          )}
          <DropdownMenuItem disabled={pending} onClick={() => start(() => signOutAction())}>
            <LogOutIcon />
            {readOnly ? "Stop viewing as" : "Sign out"}
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter((w) => !/^(mr|mrs|miss|ms|dr|prof)\.?$/i.test(w))
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
}
