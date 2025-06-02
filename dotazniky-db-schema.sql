

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
  BEGIN
    INSERT INTO public.profiles (id, email, role)
    VALUES (new.id, new.email, 'STUDENT');
    RETURN new;
  END;
  $$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
  BEGIN
      NEW.updated_at = TIMEZONE('utc', NOW());
      RETURN NEW;
  END;
  $$;


ALTER FUNCTION "public"."update_updated_at_column"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."import_history" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "imported_by" "uuid",
    "import_date" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()),
    "total_records" integer,
    "new_students" integer,
    "new_teachers" integer,
    "updated_records" integer,
    "status" character varying(50) DEFAULT 'completed'::character varying,
    "error_details" "jsonb",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()),
    "import_type" character varying(50) DEFAULT 'bulk_import'::character varying
);


ALTER TABLE "public"."import_history" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "email" "text" NOT NULL,
    "role" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "first_name" character varying(255),
    "last_name" character varying(255),
    CONSTRAINT "profiles_role_check" CHECK (("role" = ANY (ARRAY['ADMIN'::"text", 'STUDENT'::"text"])))
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."question_options" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "question_id" "uuid" NOT NULL,
    "text" "text" NOT NULL,
    "order_index" integer NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()),
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"())
);


ALTER TABLE "public"."question_options" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."question_responses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "response_id" "uuid" NOT NULL,
    "question_id" "uuid" NOT NULL,
    "answer_text" "text",
    "answer_option_id" "uuid",
    "answer_rating" integer,
    "answer_boolean" boolean,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()),
    CONSTRAINT "check_answer_type" CHECK (((("answer_text" IS NOT NULL) AND ("answer_option_id" IS NULL) AND ("answer_rating" IS NULL) AND ("answer_boolean" IS NULL)) OR (("answer_text" IS NULL) AND ("answer_option_id" IS NOT NULL) AND ("answer_rating" IS NULL) AND ("answer_boolean" IS NULL)) OR (("answer_text" IS NULL) AND ("answer_option_id" IS NULL) AND ("answer_rating" IS NOT NULL) AND ("answer_boolean" IS NULL)) OR (("answer_text" IS NULL) AND ("answer_option_id" IS NULL) AND ("answer_rating" IS NULL) AND ("answer_boolean" IS NOT NULL)))),
    CONSTRAINT "check_rating_range" CHECK ((("answer_rating" IS NULL) OR (("answer_rating" >= 1) AND ("answer_rating" <= 5))))
);


ALTER TABLE "public"."question_responses" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."questionnaire_assignments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "questionnaire_id" "uuid" NOT NULL,
    "student_teacher_subject_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"())
);


ALTER TABLE "public"."questionnaire_assignments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."questionnaire_groups" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" character varying(255) NOT NULL,
    "description" "text",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()),
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"())
);


ALTER TABLE "public"."questionnaire_groups" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."questionnaire_responses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "questionnaire_id" "uuid" NOT NULL,
    "student_email" character varying(255),
    "subject_id" "uuid" NOT NULL,
    "teacher_id" "uuid",
    "submitted_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()),
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"())
);


ALTER TABLE "public"."questionnaire_responses" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."questionnaires" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "group_id" "uuid" NOT NULL,
    "title" character varying(255) NOT NULL,
    "description" "text",
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()),
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()),
    "assignment_type" character varying(50) DEFAULT 'ALL_STUDENTS'::character varying NOT NULL,
    "is_anonymous" boolean DEFAULT false NOT NULL,
    CONSTRAINT "questionnaires_assignment_type_check" CHECK ((("assignment_type")::"text" = ANY ((ARRAY['ALL_STUDENTS'::character varying, 'SPECIFIC_STUDENTS'::character varying])::"text"[])))
);


ALTER TABLE "public"."questionnaires" OWNER TO "postgres";


COMMENT ON COLUMN "public"."questionnaires"."is_anonymous" IS 'Whether the 
  questionnaire responses are anonymous';



CREATE TABLE IF NOT EXISTS "public"."questions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "questionnaire_id" "uuid" NOT NULL,
    "text" "text" NOT NULL,
    "type" character varying(50) NOT NULL,
    "required" boolean DEFAULT false,
    "order_index" integer NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()),
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()),
    CONSTRAINT "questions_type_check" CHECK ((("type")::"text" = ANY ((ARRAY['MULTIPLE_CHOICE'::character varying, 'FREE_TEXT'::character varying, 'RATING'::character varying, 'YES_NO'::character varying])::"text"[])))
);


ALTER TABLE "public"."questions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."student_teacher_subjects" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "student_id" "uuid",
    "teacher_id" "uuid",
    "subject_id" "uuid" NOT NULL,
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()),
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"())
);


ALTER TABLE "public"."student_teacher_subjects" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."students" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" character varying(255) NOT NULL,
    "class" character varying(50),
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()),
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()),
    "email" character varying(255)
);


ALTER TABLE "public"."students" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."subjects" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" character varying(255) NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()),
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"())
);


ALTER TABLE "public"."subjects" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."teachers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" character varying(255) NOT NULL,
    "email" character varying(255),
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()),
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"())
);


ALTER TABLE "public"."teachers" OWNER TO "postgres";


ALTER TABLE ONLY "public"."import_history"
    ADD CONSTRAINT "import_history_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."question_options"
    ADD CONSTRAINT "question_options_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."question_responses"
    ADD CONSTRAINT "question_responses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."questionnaire_assignments"
    ADD CONSTRAINT "questionnaire_assignments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."questionnaire_assignments"
    ADD CONSTRAINT "questionnaire_assignments_questionnaire_id_student_teacher__key" UNIQUE ("questionnaire_id", "student_teacher_subject_id");



ALTER TABLE ONLY "public"."questionnaire_groups"
    ADD CONSTRAINT "questionnaire_groups_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."questionnaire_responses"
    ADD CONSTRAINT "questionnaire_responses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."questionnaires"
    ADD CONSTRAINT "questionnaires_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."questions"
    ADD CONSTRAINT "questions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."student_teacher_subjects"
    ADD CONSTRAINT "student_teacher_subjects_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."students"
    ADD CONSTRAINT "students_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."students"
    ADD CONSTRAINT "students_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."subjects"
    ADD CONSTRAINT "subjects_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."subjects"
    ADD CONSTRAINT "subjects_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."teachers"
    ADD CONSTRAINT "teachers_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."teachers"
    ADD CONSTRAINT "teachers_pkey" PRIMARY KEY ("id");



CREATE INDEX "idx_question_options_order_index" ON "public"."question_options" USING "btree" ("order_index");



CREATE INDEX "idx_question_options_question_id" ON "public"."question_options" USING "btree" ("question_id");



CREATE INDEX "idx_question_responses_question_id" ON "public"."question_responses" USING "btree" ("question_id");



CREATE INDEX "idx_question_responses_response_id" ON "public"."question_responses" USING "btree" ("response_id");



CREATE INDEX "idx_questionnaire_assignments_questionnaire_id" ON "public"."questionnaire_assignments" USING "btree" ("questionnaire_id");



CREATE INDEX "idx_questionnaire_assignments_sts_id" ON "public"."questionnaire_assignments" USING "btree" ("student_teacher_subject_id");



CREATE INDEX "idx_questionnaire_responses_questionnaire_id" ON "public"."questionnaire_responses" USING "btree" ("questionnaire_id");



CREATE INDEX "idx_questionnaire_responses_student_email" ON "public"."questionnaire_responses" USING "btree" ("student_email");



CREATE INDEX "idx_questionnaire_responses_subject_teacher" ON "public"."questionnaire_responses" USING "btree" ("subject_id", "teacher_id");



CREATE INDEX "idx_questionnaires_group_id" ON "public"."questionnaires" USING "btree" ("group_id");



CREATE INDEX "idx_questionnaires_is_active" ON "public"."questionnaires" USING "btree" ("is_active");



CREATE INDEX "idx_questions_order_index" ON "public"."questions" USING "btree" ("order_index");



CREATE INDEX "idx_questions_questionnaire_id" ON "public"."questions" USING "btree" ("questionnaire_id");



CREATE INDEX "idx_sts_active" ON "public"."student_teacher_subjects" USING "btree" ("is_active");



CREATE INDEX "idx_sts_student_id" ON "public"."student_teacher_subjects" USING "btree" ("student_id");



CREATE INDEX "idx_sts_subject_id" ON "public"."student_teacher_subjects" USING "btree" ("subject_id");



CREATE INDEX "idx_sts_teacher_id" ON "public"."student_teacher_subjects" USING "btree" ("teacher_id");



CREATE INDEX "idx_students_name" ON "public"."students" USING "btree" ("name");



CREATE INDEX "idx_students_name_non_unique" ON "public"."students" USING "btree" ("name");



CREATE INDEX "idx_subjects_name" ON "public"."subjects" USING "btree" ("name");



CREATE INDEX "idx_teachers_name" ON "public"."teachers" USING "btree" ("name");



CREATE UNIQUE INDEX "unique_student_questionnaire_submission" ON "public"."questionnaire_responses" USING "btree" ("questionnaire_id", "student_email", "subject_id", "teacher_id") WHERE ("student_email" IS NOT NULL);



CREATE OR REPLACE TRIGGER "update_question_options_updated_at" BEFORE UPDATE ON "public"."question_options" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_questionnaire_groups_updated_at" BEFORE UPDATE ON "public"."questionnaire_groups" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_questionnaires_updated_at" BEFORE UPDATE ON "public"."questionnaires" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_questions_updated_at" BEFORE UPDATE ON "public"."questions" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_sts_updated_at" BEFORE UPDATE ON "public"."student_teacher_subjects" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_students_updated_at" BEFORE UPDATE ON "public"."students" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_subjects_updated_at" BEFORE UPDATE ON "public"."subjects" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_teachers_updated_at" BEFORE UPDATE ON "public"."teachers" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



ALTER TABLE ONLY "public"."import_history"
    ADD CONSTRAINT "import_history_imported_by_fkey" FOREIGN KEY ("imported_by") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."question_options"
    ADD CONSTRAINT "question_options_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."question_responses"
    ADD CONSTRAINT "question_responses_answer_option_id_fkey" FOREIGN KEY ("answer_option_id") REFERENCES "public"."question_options"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."question_responses"
    ADD CONSTRAINT "question_responses_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."question_responses"
    ADD CONSTRAINT "question_responses_response_id_fkey" FOREIGN KEY ("response_id") REFERENCES "public"."questionnaire_responses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."questionnaire_assignments"
    ADD CONSTRAINT "questionnaire_assignments_questionnaire_id_fkey" FOREIGN KEY ("questionnaire_id") REFERENCES "public"."questionnaires"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."questionnaire_assignments"
    ADD CONSTRAINT "questionnaire_assignments_student_teacher_subject_id_fkey" FOREIGN KEY ("student_teacher_subject_id") REFERENCES "public"."student_teacher_subjects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."questionnaire_responses"
    ADD CONSTRAINT "questionnaire_responses_questionnaire_id_fkey" FOREIGN KEY ("questionnaire_id") REFERENCES "public"."questionnaires"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."questionnaire_responses"
    ADD CONSTRAINT "questionnaire_responses_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."questionnaire_responses"
    ADD CONSTRAINT "questionnaire_responses_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "public"."teachers"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."questionnaires"
    ADD CONSTRAINT "questionnaires_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "public"."questionnaire_groups"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."questions"
    ADD CONSTRAINT "questions_questionnaire_id_fkey" FOREIGN KEY ("questionnaire_id") REFERENCES "public"."questionnaires"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."student_teacher_subjects"
    ADD CONSTRAINT "student_teacher_subjects_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."student_teacher_subjects"
    ADD CONSTRAINT "student_teacher_subjects_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."student_teacher_subjects"
    ADD CONSTRAINT "student_teacher_subjects_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "public"."teachers"("id") ON DELETE CASCADE;



CREATE POLICY "Admins can create import history" ON "public"."import_history" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'ADMIN'::"text")))));



CREATE POLICY "Admins can manage question options" ON "public"."question_options" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'ADMIN'::"text")))));



CREATE POLICY "Admins can manage questionnaire groups" ON "public"."questionnaire_groups" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'ADMIN'::"text")))));



CREATE POLICY "Admins can manage questionnaire_assignments" ON "public"."questionnaire_assignments" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'ADMIN'::"text")))));



CREATE POLICY "Admins can manage questionnaires" ON "public"."questionnaires" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'ADMIN'::"text")))));



CREATE POLICY "Admins can manage questions" ON "public"."questions" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'ADMIN'::"text")))));



CREATE POLICY "Admins can manage relationships" ON "public"."student_teacher_subjects" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'ADMIN'::"text")))));



CREATE POLICY "Admins can manage students" ON "public"."students" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'ADMIN'::"text")))));



CREATE POLICY "Admins can manage subjects" ON "public"."subjects" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'ADMIN'::"text")))));



CREATE POLICY "Admins can manage teachers" ON "public"."teachers" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'ADMIN'::"text")))));



CREATE POLICY "Admins can view all
  relationships" ON "public"."student_teacher_subjects" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'ADMIN'::"text")))));



CREATE POLICY "Admins can view all profiles" ON "public"."profiles" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "profiles_1"
  WHERE (("profiles_1"."id" = "auth"."uid"()) AND ("profiles_1"."role" = 'ADMIN'::"text")))));



CREATE POLICY "Admins can view all question options" ON "public"."question_options" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'ADMIN'::"text")))));



CREATE POLICY "Admins can view all question responses" ON "public"."question_responses" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'ADMIN'::"text")))));



CREATE POLICY "Admins can view all questionnaire groups" ON "public"."questionnaire_groups" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'ADMIN'::"text")))));



CREATE POLICY "Admins can view all questionnaire responses" ON "public"."questionnaire_responses" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'ADMIN'::"text")))));



CREATE POLICY "Admins can view all questionnaires" ON "public"."questionnaires" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'ADMIN'::"text")))));



CREATE POLICY "Admins can view all questions" ON "public"."questions" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'ADMIN'::"text")))));



CREATE POLICY "Admins can view all students" ON "public"."students" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'ADMIN'::"text")))));



CREATE POLICY "Admins can view all subjects" ON "public"."subjects" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'ADMIN'::"text")))));



CREATE POLICY "Admins can view all teachers" ON "public"."teachers" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'ADMIN'::"text")))));



CREATE POLICY "Admins can view import history" ON "public"."import_history" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'ADMIN'::"text")))));



CREATE POLICY "Students can create question responses for their
  submissions" ON "public"."question_responses" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM (("public"."questionnaire_responses" "qr"
     JOIN "public"."profiles" "p" ON ((1 = 1)))
     JOIN "public"."students" "s" ON ((("s"."email")::"text" = "p"."email")))
  WHERE (("qr"."id" = "question_responses"."response_id") AND ("p"."id" = "auth"."uid"()) AND ("p"."role" = 'STUDENT'::"text") AND (("qr"."student_email" IS NULL) OR (("s"."email")::"text" = ("qr"."student_email")::"text"))))));



CREATE POLICY "Students can create their own responses" ON "public"."questionnaire_responses" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."profiles" "p"
     JOIN "public"."students" "s" ON ((("s"."email")::"text" = "p"."email")))
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = 'STUDENT'::"text") AND (("questionnaire_responses"."student_email" IS NULL) OR (("s"."email")::"text" = ("questionnaire_responses"."student_email")::"text"))))));



CREATE POLICY "Users can view own profile" ON "public"."profiles" FOR SELECT USING (("auth"."uid"() = "id"));



ALTER TABLE "public"."import_history" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."question_options" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."question_responses" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."questionnaire_assignments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."questionnaire_groups" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."questionnaire_responses" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."questionnaires" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."questions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."student_teacher_subjects" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."students" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."subjects" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."teachers" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";

























































































































































GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "service_role";


















GRANT ALL ON TABLE "public"."import_history" TO "anon";
GRANT ALL ON TABLE "public"."import_history" TO "authenticated";
GRANT ALL ON TABLE "public"."import_history" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."question_options" TO "anon";
GRANT ALL ON TABLE "public"."question_options" TO "authenticated";
GRANT ALL ON TABLE "public"."question_options" TO "service_role";



GRANT ALL ON TABLE "public"."question_responses" TO "anon";
GRANT ALL ON TABLE "public"."question_responses" TO "authenticated";
GRANT ALL ON TABLE "public"."question_responses" TO "service_role";



GRANT ALL ON TABLE "public"."questionnaire_assignments" TO "anon";
GRANT ALL ON TABLE "public"."questionnaire_assignments" TO "authenticated";
GRANT ALL ON TABLE "public"."questionnaire_assignments" TO "service_role";



GRANT ALL ON TABLE "public"."questionnaire_groups" TO "anon";
GRANT ALL ON TABLE "public"."questionnaire_groups" TO "authenticated";
GRANT ALL ON TABLE "public"."questionnaire_groups" TO "service_role";



GRANT ALL ON TABLE "public"."questionnaire_responses" TO "anon";
GRANT ALL ON TABLE "public"."questionnaire_responses" TO "authenticated";
GRANT ALL ON TABLE "public"."questionnaire_responses" TO "service_role";



GRANT ALL ON TABLE "public"."questionnaires" TO "anon";
GRANT ALL ON TABLE "public"."questionnaires" TO "authenticated";
GRANT ALL ON TABLE "public"."questionnaires" TO "service_role";



GRANT ALL ON TABLE "public"."questions" TO "anon";
GRANT ALL ON TABLE "public"."questions" TO "authenticated";
GRANT ALL ON TABLE "public"."questions" TO "service_role";



GRANT ALL ON TABLE "public"."student_teacher_subjects" TO "anon";
GRANT ALL ON TABLE "public"."student_teacher_subjects" TO "authenticated";
GRANT ALL ON TABLE "public"."student_teacher_subjects" TO "service_role";



GRANT ALL ON TABLE "public"."students" TO "anon";
GRANT ALL ON TABLE "public"."students" TO "authenticated";
GRANT ALL ON TABLE "public"."students" TO "service_role";



GRANT ALL ON TABLE "public"."subjects" TO "anon";
GRANT ALL ON TABLE "public"."subjects" TO "authenticated";
GRANT ALL ON TABLE "public"."subjects" TO "service_role";



GRANT ALL ON TABLE "public"."teachers" TO "anon";
GRANT ALL ON TABLE "public"."teachers" TO "authenticated";
GRANT ALL ON TABLE "public"."teachers" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "service_role";






























RESET ALL;
