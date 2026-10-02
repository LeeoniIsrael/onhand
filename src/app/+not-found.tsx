import { Empty, Screen } from "../design/ui";
import { go } from "../design/Shell";
export default function NotFound() {
  return (
    <Screen narrow>
      <Empty
        title="Let’s find your way home."
        text="That page isn’t here."
        action="Go home"
        onPress={() => go("/")}
      />
    </Screen>
  );
}
