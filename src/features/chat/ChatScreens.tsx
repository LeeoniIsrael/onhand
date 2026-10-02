import React, { useEffect, useRef, useState } from "react";
import { View, ScrollView } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import {
  ArrowUp,
  ImagePlus,
  MessageCircle,
  ShieldCheck,
  ChevronRight,
} from "lucide-react-native";
import { colors as c } from "../../design/tokens";
import {
  Avatar,
  Col,
  Empty,
  Field,
  IconButton,
  Pill,
  Row,
  Screen,
  Surface,
  Touch,
  Txt,
} from "../../design/ui";
import { go } from "../../design/Shell";
import { useStore } from "../../state/store";
import { workers } from "../../domain/seed";
import { demoMessaging } from "../../services/adapters";
import { Message } from "../../domain/models";
const messageId = () => `message-${Date.now()}`;
export function MessagesScreen() {
  const jobs = useStore((s) => s.jobs),
    messages = useStore((s) => s.messages);
  return (
    <Screen
      narrow
      title="A direct line."
      subtitle="A little clarity goes a long way."
    >
      {jobs
        .filter((j) => j.workerId)
        .map((j) => {
          const worker = workers.find((w) => w.id === j.workerId) || workers[0],
            latest = messages.filter((m) => m.jobId === j.id).at(-1);
          return (
            <Touch
              label={`Chat with ${worker.name} about ${j.title}`}
              key={j.id}
              onPress={() => go(`/chat?id=${j.id}`)}
            >
              <Surface>
                <Row>
                  <Avatar name={worker.name} uri={worker.avatar} size={52} />
                  <Col style={{ flex: 1, gap: 4 }}>
                    <Txt size={16} weight="600">
                      {worker.name}
                    </Txt>
                    <Txt size={12} color={c.muted}>
                      {j.title}
                    </Txt>
                    <Txt size={12} color={c.subtle} numberOfLines={1}>
                      {latest?.text || "Your conversation starts here."}
                    </Txt>
                  </Col>
                  <ChevronRight size={18} color={c.subtle} />
                </Row>
              </Surface>
            </Touch>
          );
        })}
      <Row>
        <ShieldCheck size={16} color={c.green} />
        <Txt size={11} color={c.muted}>
          Keep job conversations here. Your phone number stays private.
        </Txt>
      </Row>
    </Screen>
  );
}
export function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>(),
    job = useStore((s) => s.jobs.find((j) => j.id === id)),
    allMessages = useStore((s) => s.messages),
    role = useStore((s) => s.role),
    [text, setText] = useState(""),
    timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const messages = allMessages.filter((m) => m.jobId === id);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  if (!job?.workerId)
    return (
      <Screen narrow>
        <Empty
          title="A connection comes first."
          text="Chat opens after a specialist accepts your request."
          action="My jobs"
          onPress={() => go("/jobs")}
        />
      </Screen>
    );
  const worker = workers.find((w) => w.id === job.workerId) || workers[0];
  async function send(value: string, photo?: string) {
    if (!value.trim() && !photo) return;
    const m: Message = {
      id: messageId(),
      jobId: id,
      sender: role,
      text: value.trim(),
      photo,
      createdAt: new Date().toISOString(),
      state: "sending",
    };
    useStore.getState().addMessage(m);
    setText("");
    try {
      await demoMessaging.send(m);
      useStore.getState().updateMessage(m.id, "sent");
      timers.current.push(
        setTimeout(
          () =>
            useStore.getState().addMessage({
              id: `reply-${m.id}`,
              jobId: id,
              sender: role === "customer" ? "worker" : "customer",
              text: /buzzer|door|access/i.test(value)
                ? "Got it, thanks! I’ll message you when I’m downstairs."
                : /photo|picture/i.test(value) || photo
                  ? "Thanks for the photo. I’ll take a closer look when I arrive."
                  : "Thanks for letting me know. I’ll keep you posted here.",
              createdAt: new Date().toISOString(),
              state: "sent",
            }),
          1400,
        ),
      );
    } catch {
      useStore.getState().updateMessage(m.id, "failed");
    }
  }
  async function attach() {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        quality: 0.75,
      });
      if (!result.canceled) await send("Here’s a photo.", result.assets[0].uri);
    } catch {
      useStore.getState().notify("Couldn’t attach that photo. Try again.");
    }
  }
  return (
    <Screen narrow>
      <Row>
        <Avatar name={worker.name} uri={worker.avatar} />
        <Col style={{ flex: 1, gap: 2 }}>
          <Txt size={22} weight="600">
            {role === "worker" ? "Alex Morgan" : worker.name}
          </Txt>
          <Txt size={12} color={c.muted}>
            {job.title}
          </Txt>
        </Col>
        <Pill text="Demo chat" color={c.muted} />
      </Row>
      <Touch label="View job context" onPress={() => go(`/tracking?id=${id}`)}>
        <Surface style={{ padding: 15 }}>
          <Row>
            <MessageCircle color={c.orange} size={18} />
            <Txt size={12} style={{ flex: 1 }}>
              {job.title} · ${job.offer}
            </Txt>
            <ChevronRight size={16} color={c.subtle} />
          </Row>
        </Surface>
      </Touch>
      <Col style={{ minHeight: 260 }}>
        {!messages.length && (
          <Txt
            size={12}
            color={c.subtle}
            style={{ textAlign: "center", padding: 20 }}
          >
            You’re connected. Say hello or share a detail about the job.
          </Txt>
        )}
        {messages.map((m) =>
          m.sender === "system" ? (
            <Txt
              key={m.id}
              size={11}
              color={c.subtle}
              style={{ textAlign: "center" }}
            >
              {m.text}
            </Txt>
          ) : (
            <View
              key={m.id}
              style={{
                alignSelf: m.sender === role ? "flex-end" : "flex-start",
                maxWidth: "86%",
                gap: 5,
              }}
            >
              <View
                style={{
                  backgroundColor: m.sender === role ? "#3e2a20" : c.elevated,
                  padding: 15,
                  borderRadius: 16,
                  borderBottomRightRadius: m.sender === role ? 4 : 16,
                  borderBottomLeftRadius: m.sender === role ? 16 : 4,
                  gap: 10,
                }}
              >
                {m.photo && (
                  <Image
                    source={{ uri: m.photo }}
                    style={{ width: 200, height: 150, borderRadius: 10 }}
                  />
                )}
                <Txt>{m.text}</Txt>
              </View>
              <Txt size={10} color={c.subtle}>
                {new Date(m.createdAt).toLocaleTimeString([], {
                  hour: "numeric",
                  minute: "2-digit",
                })}{" "}
                · {m.state}
              </Txt>
              {m.state === "failed" && (
                <Touch
                  label="Retry message"
                  onPress={() => send(m.text, m.photo)}
                >
                  <Txt color={c.orange}>Retry</Txt>
                </Touch>
              )}
            </View>
          ),
        )}
      </Col>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8 }}
      >
        {["The buzzer is 4B", "I’m home", "See you soon!"].map((reply) => (
          <Touch
            key={reply}
            label={reply}
            onPress={() => send(reply)}
            style={{
              minHeight: 44,
              justifyContent: "center",
              backgroundColor: c.surface,
              paddingHorizontal: 16,
              borderRadius: 24,
            }}
          >
            <Txt color={c.muted} size={12}>
              {reply}
            </Txt>
          </Touch>
        ))}
      </ScrollView>
      <Row style={{ alignItems: "flex-end" }}>
        <IconButton icon={ImagePlus} label="Attach a photo" onPress={attach} />
        <View style={{ flex: 1 }}>
          <Field
            label="Message"
            placeholder="Write a message…"
            value={text}
            onChangeText={setText}
            onSubmitEditing={() => send(text)}
          />
        </View>
        <IconButton
          icon={ArrowUp}
          label="Send message"
          accent
          onPress={() => send(text)}
        />
      </Row>
    </Screen>
  );
}
