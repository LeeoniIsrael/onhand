import React from "react";
import { useLocalSearchParams } from "expo-router";
import JobScreen from "../marketplace/JobScreen";
export default function Job() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  return <JobScreen key={typeof id === "string" ? id : "empty"} />;
}
