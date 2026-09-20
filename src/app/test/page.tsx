import { createClient } from "@/lib/supabase/server";

export default async function TestPage() {

  const supabase = await createClient();

  const { data } = await supabase
    .from("projects")
    .select("*");


  return (
    <pre>
      {JSON.stringify(data, null, 2)}
    </pre>
  );
}