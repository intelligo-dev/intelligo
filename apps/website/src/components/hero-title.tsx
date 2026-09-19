import { TextReveal } from "@/components/ui/text-reveal";

/**
 * The headline: a lighter first line with one bold word, a heavier
 * second line where the key phrase is foreground and the rest is muted.
 * Words rise out of a blur — once, on load.
 */
export function HeroTitle() {
  return (
    <h1 className="heading">
      <span className="block text-[clamp(1.6rem,3vw,2.25rem)] font-medium leading-[1.15] text-muted-foreground">
        <TextReveal text="You build the " />
        <TextReveal
          text="agent."
          delay={0.21}
          className="font-bold text-foreground"
        />
      </span>
      <span className="block text-[clamp(2.2rem,4.4vw,3.25rem)] font-bold leading-[1.05] tracking-tight text-muted-foreground">
        <TextReveal text="Intelligo is " delay={0.3} />
        <TextReveal
          text="everything around it."
          delay={0.44}
          className="text-foreground"
        />
      </span>
    </h1>
  );
}
