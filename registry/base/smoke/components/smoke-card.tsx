import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function SmokeCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Registry smoke test</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">
          If you can see this card, the Intelligo registry pipeline built,
          installed, and rendered correctly.
        </p>
        <Button>It works</Button>
      </CardContent>
    </Card>
  );
}
