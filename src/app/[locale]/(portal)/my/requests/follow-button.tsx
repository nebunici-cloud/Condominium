"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { CheckIcon, UsersIcon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

import { followRequest, unfollowRequest } from "./actions";

// "This affects me too" for a public common-area request. Optimistic
// toggle; the affected-household count updates on the next load.
export function FollowButton({
  requestId,
  tenantId,
  following,
}: {
  requestId: string;
  tenantId: string;
  following: boolean;
}) {
  const t = useTranslations("maintenance");
  const [isFollowing, setIsFollowing] = useState(following);
  const [pending, startTransition] = useTransition();

  function toggle() {
    const next = !isFollowing;
    setIsFollowing(next);
    startTransition(async () => {
      const result = next
        ? await followRequest({ requestId, tenantId })
        : await unfollowRequest(requestId);
      if (result.error) {
        setIsFollowing(!next);
        toast.error(result.error);
      }
    });
  }

  return (
    <Button
      variant={isFollowing ? "secondary" : "outline"}
      size="sm"
      onClick={toggle}
      disabled={pending}
    >
      {isFollowing ? <CheckIcon /> : <UsersIcon />}
      {isFollowing ? t("followingLabel") : t("affectsMeToo")}
    </Button>
  );
}
