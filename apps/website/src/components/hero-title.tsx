import { TextReveal } from "@/components/ui/text-reveal";

/**
 * The headline: the promise in the foreground, then the one thing left
 * out of it, muted but for its last words. Words rise out of a blur —
 * once, on load.
 */
export function HeroTitle() {
  return (
    <h1 className="heading text-[clamp(2.2rem,4.6vw,3.5rem)] font-bold leading-[1.05] tracking-tight">
      <span className="block text-foreground">
        <TextReveal text="Everything your AI product needs." />
      </span>
      <span className="block text-muted-foreground">
        <TextReveal text="Except " delay={0.4} />
        <TextReveal text="the AI." delay={0.48} className="text-foreground" />
      </span>
    </h1>
  );
}
