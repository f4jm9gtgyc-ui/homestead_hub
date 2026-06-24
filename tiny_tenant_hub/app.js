const SUPABASE_URL = "https://dugyrawoqiztodugzwmi.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR1Z3lyYXdvcWl6dG9kdWd6d21pIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE5MDA2OTUsImV4cCI6MjA5NzQ3NjY5NX0.A_HQwb6IXldqsoEYab56Nng2pSytFSi6OTZbhUNIeHc";

const supabase = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY
);
