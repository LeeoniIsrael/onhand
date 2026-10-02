import React from "react";
import { View, ScrollView, useWindowDimensions } from "react-native";
import {
  ArrowUpRight,
  Camera,
  Droplets,
  Zap,
  Armchair,
  Frame,
  Wrench,
  Plus,
  ShieldCheck,
  Star,
  ScanLine,
  ChevronRight,
} from "lucide-react-native";
import { colors as c } from "../../design/tokens";
import {
  Avatar,
  Button,
  Col,
  Pill,
  Row,
  Screen,
  SectionHeading,
  Surface,
  Touch,
  Txt,
} from "../../design/ui";
import { NeighborhoodMap } from "../../design/Map";
import { go } from "../../design/Shell";
import { useStore } from "../../state/store";
import { workers } from "../../domain/seed";
import { Category, taxonomy } from "../../domain/models";
import { statusLabel } from "../../domain/lifecycle";
const shortcuts = [
  { label: "Plumbing", icon: Droplets, sub: "Leaks & drains" },
  { label: "Electrical", icon: Zap, sub: "Lights & outlets" },
  { label: "Assembly", icon: Armchair, sub: "Furniture & more" },
  { label: "Mounting", icon: Frame, sub: "Walls, meet art" },
  { label: "General repair", icon: Wrench, sub: "The little fixes" },
];
export default function HomeScreen() {
  const { width } = useWindowDimensions(),
    wide = width > 800,
    name = useStore((s) => s.name),
    jobs = useStore((s) => s.jobs),
    active = jobs.find(
      (j) => !["completed", "cancelled", "draft"].includes(j.status),
    );
  const request = (category?: Category) => {
    useStore.getState().resetDraft();
    if (category)
      useStore.getState().editDraft({ category, skill: taxonomy[category][0] });
    go("/request");
  };
  return (
    <Screen>
      <Row style={{ justifyContent: "space-between", alignItems: "flex-end" }}>
        <Col style={{ gap: 7 }}>
          <Txt color={c.muted} size={13}>
            Hey {name}, make yourself at home.
          </Txt>
          <Txt
            size={wide ? 43 : 33}
            weight="600"
            style={{ lineHeight: wide ? 51 : 41 }}
          >
            What needs fixing?
          </Txt>
        </Col>
        {wide && <Pill text="Your neighborhood is online" />}
      </Row>
      {active && (
        <Touch
          label="Track your active job"
          onPress={() => go(`/tracking?id=${active.id}`)}
        >
          <Surface
            style={{ borderColor: "#53402f", borderWidth: 1, padding: 16 }}
          >
            <Row>
              <View
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 8,
                  backgroundColor: c.orange,
                }}
              />
              <Col style={{ flex: 1, gap: 2 }}>
                <Txt weight="600">{statusLabel[active.status]}</Txt>
                <Txt size={12} color={c.muted}>
                  {active.title}
                </Txt>
              </Col>
              <Txt size={12} color={c.orange}>
                View job
              </Txt>
              <ArrowUpRight color={c.orange} size={17} />
            </Row>
          </Surface>
        </Touch>
      )}
      <View style={{ flexDirection: wide ? "row" : "column-reverse", gap: 20 }}>
        <View style={{ flex: wide ? 1.65 : undefined }}>
          <NeighborhoodMap height={wide ? 357 : 250}>
            <View style={{ position: "absolute", top: 20, left: 20 }}>
              <Pill
                text="Good people, just around the corner"
                color="#d8dfd4"
              />
            </View>
            <View
              style={{ position: "absolute", left: 20, bottom: 26, right: 20 }}
            >
              <Row
                style={{
                  justifyContent: "space-between",
                  alignItems: "flex-end",
                }}
              >
                <Col style={{ gap: 5, flex: 1 }}>
                  <Txt size={wide ? 26 : 23} weight="600">
                    Help is closer{"\n"}than you think.
                  </Txt>
                  <Row style={{ gap: 7 }}>
                    <View
                      style={{
                        height: 5,
                        width: 5,
                        borderRadius: 5,
                        backgroundColor: c.green,
                      }}
                    />
                    <Txt size={11} color="#b2bcb5">
                      Local specialists. Ready when you are.
                    </Txt>
                  </Row>
                </Col>
                {wide && (
                  <View
                    style={{
                      backgroundColor: "#151c1a",
                      borderRadius: 14,
                      padding: 12,
                      alignItems: "center",
                    }}
                  >
                    <Txt size={24} weight="600">
                      5–12
                      <Txt size={11} color={c.muted}>
                        {" "}
                        min
                      </Txt>
                    </Txt>
                    <Txt size={9} color={c.muted}>
                      Typical arrival · demo
                    </Txt>
                  </View>
                )}
              </Row>
            </View>
          </NeighborhoodMap>
        </View>
        <Surface
          style={{
            flex: wide ? 1 : undefined,
            padding: 25,
            justifyContent: "space-between",
            minHeight: 300,
            backgroundColor: "#202222",
            borderWidth: 1,
            borderColor: "#30312e",
          }}
        >
          <Row style={{ justifyContent: "space-between" }}>
            <View
              style={{
                width: 51,
                height: 51,
                borderRadius: 16,
                backgroundColor: c.orangeSoft,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <ScanLine color={c.orange} size={27} strokeWidth={1.5} />
            </View>
            <Txt size={11} color={c.muted}>
              A photo is all it takes
            </Txt>
          </Row>
          <Col style={{ gap: 8, paddingVertical: 22 }}>
            <Txt size={29} weight="600" style={{ lineHeight: 35 }}>
              Show us the problem.{"\n"}We’ll find your person.
            </Txt>
            <Txt color={c.muted} size={13} style={{ maxWidth: 270 }}>
              Snap a photo. Set your price. Get on with your day.
            </Txt>
          </Col>
          <Button
            title="Find help now"
            icon={ArrowUpRight}
            onPress={() => request()}
          />
          <Touch
            label="Take a photo"
            onPress={() => {
              request();
              go("/request?step=camera");
            }}
            style={{ alignItems: "center", paddingTop: 14, minHeight: 40 }}
          >
            <Row style={{ gap: 7 }}>
              <Camera size={14} color={c.muted} />
              <Txt size={11} color={c.muted}>
                Or start with your camera
              </Txt>
            </Row>
          </Touch>
        </Surface>
      </View>
      <View>
        <SectionHeading
          title="Little fixes. Big relief."
          action="All services"
          onPress={() => go("/services")}
        />
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 12 }}
        >
          {shortcuts.map(({ label, icon: Icon, sub }) => (
            <Touch
              key={label}
              label={`Request ${label}`}
              onPress={() => request(label as Category)}
              style={{
                width: wide
                  ? Math.max(
                      137,
                      (Math.min(width - (width >= 1050 ? 300 : 40), 1240) -
                        60) /
                        6,
                    )
                  : 142,
                backgroundColor: c.surface,
                padding: 18,
                borderRadius: 16,
                gap: 17,
              }}
            >
              <Icon size={26} color="#d9dbd5" strokeWidth={1.4} />
              <Col style={{ gap: 3 }}>
                <Txt size={13} weight="500">
                  {label === "General repair" ? "General repair" : label}
                </Txt>
                <Txt size={10} color={c.subtle}>
                  {sub}
                </Txt>
              </Col>
            </Touch>
          ))}
          <Touch
            label="Browse all services"
            onPress={() => go("/services")}
            style={{
              width: wide ? 130 : 110,
              padding: 18,
              backgroundColor: "#17191a",
              borderRadius: 16,
              justifyContent: "space-between",
            }}
          >
            <Plus size={26} color={c.subtle} />
            <Col style={{ gap: 3 }}>
              <Txt size={13} weight="500">
                Something else?
              </Txt>
              <Txt size={10} color={c.subtle}>
                We can help
              </Txt>
            </Col>
          </Touch>
        </ScrollView>
      </View>
      <View>
        <SectionHeading
          title="Familiar faces. Trusted hands."
          action="Meet your local pros"
          onPress={() => go("/specialists")}
        />
        <View style={{ flexDirection: wide ? "row" : "column", gap: 14 }}>
          {workers.slice(0, 3).map((w, i) => (
            <Touch
              key={w.id}
              label={`View ${w.name}`}
              onPress={() => go(`/specialist?id=${w.id}`)}
              style={{ flex: 1 }}
            >
              <Surface style={{ padding: 19 }}>
                <Row>
                  <Avatar name={w.name} uri={w.avatar} size={48} />
                  <Col style={{ flex: 1, gap: 2 }}>
                    <Row style={{ gap: 5 }}>
                      <Txt weight="600">
                        {w.name.split(" ")[0]} {w.name.split(" ")[1][0]}.
                      </Txt>
                      <ShieldCheck color={c.green} size={13} />
                    </Row>
                    <Txt size={11} color={c.muted}>
                      {
                        [
                          "Plumbing specialist",
                          "Your go-to for assembly",
                          "Repairs & installations",
                        ][i]
                      }
                    </Txt>
                  </Col>
                  <ArrowUpRight size={17} color={c.subtle} />
                </Row>
                <Row
                  style={{
                    marginTop: 18,
                    paddingTop: 13,
                    borderTopWidth: 1,
                    borderTopColor: c.line,
                    justifyContent: "space-between",
                  }}
                >
                  <Row style={{ gap: 5 }}>
                    <Star size={12} color={c.amber} fill={c.amber} />
                    <Txt size={11} weight="500">
                      {w.metrics.rating.toFixed(2)}
                    </Txt>
                    <Txt size={10} color={c.subtle}>
                      ({w.metrics.reviews})
                    </Txt>
                  </Row>
                  <Txt size={10} color={i === 0 ? c.orange : c.muted}>
                    {i === 0 ? "You’ve worked together" : "Neighbor-approved"}
                  </Txt>
                </Row>
              </Surface>
            </Touch>
          ))}
        </View>
      </View>
      <View>
        <SectionHeading
          title="Previously handled"
          action="All jobs"
          onPress={() => go("/jobs")}
        />
        {jobs
          .filter((j) => j.status === "completed")
          .slice(0, 2)
          .map((j) => (
            <Touch
              label={`View ${j.title}`}
              key={j.id}
              onPress={() => go(`/job?id=${j.id}`)}
              style={{
                paddingVertical: 15,
                borderTopWidth: 1,
                borderTopColor: c.line,
              }}
            >
              <Row>
                <View
                  style={{
                    backgroundColor: c.surface,
                    width: 44,
                    height: 44,
                    borderRadius: 12,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Wrench size={19} color={c.muted} />
                </View>
                <Col style={{ flex: 1, gap: 3 }}>
                  <Txt size={13} weight="500">
                    {j.title}
                  </Txt>
                  <Txt size={11} color={c.subtle}>
                    {new Date(j.createdAt).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                    })}{" "}
                    · {j.category}
                  </Txt>
                </Col>
                <Txt size={13}>${j.offer}</Txt>
                <Pill text="All fixed" />
                <ChevronRight size={16} color={c.subtle} />
              </Row>
            </Touch>
          ))}
      </View>
      <Row style={{ justifyContent: "center", gap: 8, paddingVertical: 8 }}>
        <ShieldCheck size={14} color={c.subtle} />
        <Txt size={11} color={c.subtle}>
          Your home. Your price. Always your call.
        </Txt>
      </Row>
    </Screen>
  );
}
