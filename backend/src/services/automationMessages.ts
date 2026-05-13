import OpenAI from 'openai';
import { AI_AUTOMATION_MODEL } from '../config/aiModel.js';
import { stripThinkTags } from './aiService.js';
import { Account } from '../models/Account.js';

export const SUPPORTED_AUTOMATION_LANGUAGES = [
  'es', 'en', 'pt', 'fr', 'de', 'it', 'nl', 'pl', 'sv', 'no', 'da', 'fi',
  'el', 'cs', 'hu', 'ro', 'bg', 'hr', 'sk', 'sl', 'lt', 'lv', 'et',
] as const;

export type SupportedAutomationLanguage = (typeof SUPPORTED_AUTOMATION_LANGUAGES)[number];

export type AutomationMessageKey =
  | 'serviceNotOffered'
  | 'consultaReviewedMoreInfo'
  | 'assignedSpecializedLawyer'
  | 'futureNeedServices'
  | 'assignedSpecializedProfessional'
  | 'couldNotAssignRightNow'
  | 'requestUnderReview'
  | 'assignmentAskEmail'
  | 'assignmentAskWhatsApp';

type MessageVariables = {
  espName?: string;
};

const COUNTRY_LANGUAGE_MAP: Record<string, SupportedAutomationLanguage> = {
  ES: 'es', AD: 'es', MX: 'es', AR: 'es', CO: 'es', UY: 'es', PA: 'es', DO: 'es', CL: 'es', PE: 'es',
  EC: 'es', BO: 'es', PY: 'es', CR: 'es', GT: 'es', HN: 'es', SV: 'es', NI: 'es',
  GB: 'en', AU: 'en', CA: 'en', IE: 'en', MT: 'en', CY: 'en', US: 'en', NZ: 'en', SG: 'en',
  PT: 'pt', BR: 'pt',
  FR: 'fr', BE: 'fr', LU: 'fr', MC: 'fr',
  DE: 'de', AT: 'de', LI: 'de',
  IT: 'it',
  NL: 'nl',
  PL: 'pl',
  SE: 'sv',
  NO: 'no',
  DK: 'da',
  FI: 'fi',
  GR: 'el',
  CZ: 'cs',
  HU: 'hu',
  RO: 'ro',
  BG: 'bg',
  HR: 'hr',
  SK: 'sk',
  SI: 'sl',
  LT: 'lt',
  LV: 'lv',
  EE: 'et',
  CH: 'de',
};

const LANGUAGE_CODE_PATTERN = new RegExp(`\\b(${SUPPORTED_AUTOMATION_LANGUAGES.join('|')})\\b`, 'i');

const AUTOMATION_MESSAGES: Record<SupportedAutomationLanguage, Record<AutomationMessageKey, string>> = {
  es: {
    serviceNotOffered: "Lamentamos informarle de que actualmente no ofrecemos el servicio solicitado. Le pedimos disculpas por las molestias.",
    consultaReviewedMoreInfo: "Hemos revisado su consulta y le responderemos en breve con más información.",
    assignedSpecializedLawyer: "Perfecto, le hemos asignado un abogado especializado. Se pondrá en contacto con usted en breve.",
    futureNeedServices: "Entendido. Si en el futuro necesita nuestros servicios, no dude en contactarnos.",
    assignedSpecializedProfessional: "Hemos asignado su caso a un profesional especializado. Le contactará en breve.",
    couldNotAssignRightNow: "No hemos podido asignar su caso en este momento. Nos pondremos en contacto con usted lo antes posible.",
    requestUnderReview: "Hemos recibido su solicitud. La estamos revisando y le responderemos en breve.",
    assignmentAskEmail: "Hemos recibido su solicitud. Contamos con abogados especializados en {espName}. ¿Le gustaría que le asignemos un abogado para su caso? Responda a este email para confirmar.",
    assignmentAskWhatsApp: "Hemos recibido su solicitud. Contamos con abogados especializados en {espName}. ¿Le gustaría que le asignemos un abogado para su caso? Responda a este mensaje para confirmar.",
  },
  en: {
    serviceNotOffered: "We regret to inform you that we do not currently offer the requested service. We apologize for the inconvenience.",
    consultaReviewedMoreInfo: "We have reviewed your enquiry and will get back to you shortly with more information.",
    assignedSpecializedLawyer: "Perfect, we have assigned a specialized lawyer to your case. They will contact you shortly.",
    futureNeedServices: "Understood. If you need our services in the future, please do not hesitate to contact us.",
    assignedSpecializedProfessional: "We have assigned your case to a specialized professional. They will contact you shortly.",
    couldNotAssignRightNow: "We have not been able to assign your case at this time. We will contact you as soon as possible.",
    requestUnderReview: "We have received your request. We are reviewing it and will get back to you shortly.",
    assignmentAskEmail: "We have received your request. We have lawyers specialized in {espName}. Would you like us to assign a lawyer to your case? Please reply to this email to confirm.",
    assignmentAskWhatsApp: "We have received your request. We have lawyers specialized in {espName}. Would you like us to assign a lawyer to your case? Please reply to this message to confirm.",
  },
  pt: {
    serviceNotOffered: "Lamentamos informar que, de momento, não oferecemos o serviço solicitado. Pedimos desculpa pelo incómodo.",
    consultaReviewedMoreInfo: "Revimos a sua consulta e responderemos em breve com mais informações.",
    assignedSpecializedLawyer: "Perfeito, atribuímos ao seu caso um advogado especializado. Entrará em contacto consigo em breve.",
    futureNeedServices: "Entendido. Se no futuro precisar dos nossos serviços, não hesite em contactar-nos.",
    assignedSpecializedProfessional: "Atribuímos o seu caso a um profissional especializado. Entrará em contacto consigo em breve.",
    couldNotAssignRightNow: "Não foi possível atribuir o seu caso neste momento. Entraremos em contacto consigo o mais rapidamente possível.",
    requestUnderReview: "Recebemos o seu pedido. Estamos a analisá-lo e responderemos em breve.",
    assignmentAskEmail: "Recebemos o seu pedido. Dispomos de advogados especializados em {espName}. Gostaria que lhe atribuíssemos um advogado para o seu caso? Responda a este email para confirmar.",
    assignmentAskWhatsApp: "Recebemos o seu pedido. Dispomos de advogados especializados em {espName}. Gostaria que lhe atribuíssemos um advogado para o seu caso? Responda a esta mensagem para confirmar.",
  },
  fr: {
    serviceNotOffered: "Nous sommes désolés de vous informer que nous ne proposons pas actuellement le service demandé. Nous vous prions de nous excuser pour la gêne occasionnée.",
    consultaReviewedMoreInfo: "Nous avons examiné votre demande et nous vous répondrons prochainement avec plus d'informations.",
    assignedSpecializedLawyer: "Parfait, nous avons attribué votre dossier à un avocat spécialisé. Il vous contactera prochainement.",
    futureNeedServices: "Bien compris. Si vous avez besoin de nos services à l'avenir, n'hésitez pas à nous contacter.",
    assignedSpecializedProfessional: "Nous avons attribué votre dossier à un professionnel spécialisé. Il vous contactera prochainement.",
    couldNotAssignRightNow: "Nous n'avons pas pu attribuer votre dossier pour le moment. Nous vous contacterons dès que possible.",
    requestUnderReview: "Nous avons bien reçu votre demande. Nous l'examinons et nous vous répondrons prochainement.",
    assignmentAskEmail: "Nous avons bien reçu votre demande. Nous disposons d'avocats spécialisés en {espName}. Souhaitez-vous que nous vous attribuions un avocat pour votre dossier ? Répondez à cet email pour confirmer.",
    assignmentAskWhatsApp: "Nous avons bien reçu votre demande. Nous disposons d'avocats spécialisés en {espName}. Souhaitez-vous que nous vous attribuions un avocat pour votre dossier ? Répondez à ce message pour confirmer.",
  },
  de: {
    serviceNotOffered: "Wir bedauern, Ihnen mitteilen zu müssen, dass wir den angefragten Service derzeit nicht anbieten. Wir entschuldigen uns für die Unannehmlichkeiten.",
    consultaReviewedMoreInfo: "Wir haben Ihre Anfrage geprüft und werden uns in Kürze mit weiteren Informationen bei Ihnen melden.",
    assignedSpecializedLawyer: "Perfekt, wir haben Ihrem Fall einen spezialisierten Anwalt zugewiesen. Er wird sich in Kürze bei Ihnen melden.",
    futureNeedServices: "Verstanden. Wenn Sie in Zukunft unsere Dienstleistungen benötigen, zögern Sie nicht, uns zu kontaktieren.",
    assignedSpecializedProfessional: "Wir haben Ihren Fall einem spezialisierten Experten zugewiesen. Er wird sich in Kürze bei Ihnen melden.",
    couldNotAssignRightNow: "Wir konnten Ihren Fall derzeit nicht zuweisen. Wir werden uns so schnell wie möglich bei Ihnen melden.",
    requestUnderReview: "Wir haben Ihre Anfrage erhalten. Wir prüfen sie und melden uns in Kürze bei Ihnen.",
    assignmentAskEmail: "Wir haben Ihre Anfrage erhalten. Wir verfügen über auf {espName} spezialisierte Anwälte. Möchten Sie, dass wir Ihrem Fall einen Anwalt zuweisen? Antworten Sie zur Bestätigung auf diese E-Mail.",
    assignmentAskWhatsApp: "Wir haben Ihre Anfrage erhalten. Wir verfügen über auf {espName} spezialisierte Anwälte. Möchten Sie, dass wir Ihrem Fall einen Anwalt zuweisen? Antworten Sie zur Bestätigung auf diese Nachricht.",
  },
  it: {
    serviceNotOffered: "Siamo spiacenti di informarla che al momento non offriamo il servizio richiesto. Ci scusiamo per il disagio.",
    consultaReviewedMoreInfo: "Abbiamo esaminato la sua richiesta e le risponderemo a breve con maggiori informazioni.",
    assignedSpecializedLawyer: "Perfetto, abbiamo assegnato al suo caso un avvocato specializzato. La contatterà a breve.",
    futureNeedServices: "Capito. Se in futuro avrà bisogno dei nostri servizi, non esiti a contattarci.",
    assignedSpecializedProfessional: "Abbiamo assegnato il suo caso a un professionista specializzato. La contatterà a breve.",
    couldNotAssignRightNow: "Al momento non siamo riusciti ad assegnare il suo caso. La contatteremo il prima possibile.",
    requestUnderReview: "Abbiamo ricevuto la sua richiesta. La stiamo esaminando e le risponderemo a breve.",
    assignmentAskEmail: "Abbiamo ricevuto la sua richiesta. Disponiamo di avvocati specializzati in {espName}. Desidera che le assegniamo un avvocato per il suo caso? Risponda a questa email per confermare.",
    assignmentAskWhatsApp: "Abbiamo ricevuto la sua richiesta. Disponiamo di avvocati specializzati in {espName}. Desidera che le assegniamo un avvocato per il suo caso? Risponda a questo messaggio per confermare.",
  },
  nl: {
    serviceNotOffered: "Het spijt ons u te moeten meedelen dat wij de gevraagde dienst momenteel niet aanbieden. Onze excuses voor het ongemak.",
    consultaReviewedMoreInfo: "We hebben uw aanvraag bekeken en nemen binnenkort contact met u op met meer informatie.",
    assignedSpecializedLawyer: "Prima, we hebben een gespecialiseerde advocaat aan uw zaak toegewezen. Deze neemt binnenkort contact met u op.",
    futureNeedServices: "Begrepen. Mocht u in de toekomst onze diensten nodig hebben, neem dan gerust contact met ons op.",
    assignedSpecializedProfessional: "We hebben uw zaak toegewezen aan een gespecialiseerde professional. Deze neemt binnenkort contact met u op.",
    couldNotAssignRightNow: "We hebben uw zaak op dit moment nog niet kunnen toewijzen. We nemen zo snel mogelijk contact met u op.",
    requestUnderReview: "We hebben uw verzoek ontvangen. We bekijken het en komen binnenkort bij u terug.",
    assignmentAskEmail: "We hebben uw verzoek ontvangen. We beschikken over advocaten die gespecialiseerd zijn in {espName}. Wilt u dat wij een advocaat aan uw zaak toewijzen? Beantwoord deze e-mail om te bevestigen.",
    assignmentAskWhatsApp: "We hebben uw verzoek ontvangen. We beschikken over advocaten die gespecialiseerd zijn in {espName}. Wilt u dat wij een advocaat aan uw zaak toewijzen? Beantwoord dit bericht om te bevestigen.",
  },
  pl: {
    serviceNotOffered: "Z przykrością informujemy, że obecnie nie oferujemy żądanej usługi. Przepraszamy za niedogodności.",
    consultaReviewedMoreInfo: "Przeanalizowaliśmy Państwa zapytanie i wkrótce wrócimy z dodatkowymi informacjami.",
    assignedSpecializedLawyer: "Świetnie, przydzieliliśmy do Państwa sprawy wyspecjalizowanego prawnika. Wkrótce się z Państwem skontaktuje.",
    futureNeedServices: "Rozumiemy. Jeśli w przyszłości będą Państwo potrzebować naszych usług, prosimy o kontakt.",
    assignedSpecializedProfessional: "Przydzieliliśmy Państwa sprawę wyspecjalizowanemu specjaliście. Wkrótce się z Państwem skontaktuje.",
    couldNotAssignRightNow: "Nie udało nam się obecnie przydzielić Państwa sprawy. Skontaktujemy się z Państwem tak szybko, jak to możliwe.",
    requestUnderReview: "Otrzymaliśmy Państwa zgłoszenie. Analizujemy je i wkrótce się odezwiemy.",
    assignmentAskEmail: "Otrzymaliśmy Państwa zgłoszenie. Współpracujemy z prawnikami wyspecjalizowanymi w zakresie {espName}. Czy chcą Państwo, abyśmy przydzielili prawnika do tej sprawy? Prosimy odpowiedzieć na tę wiadomość e-mail, aby potwierdzić.",
    assignmentAskWhatsApp: "Otrzymaliśmy Państwa zgłoszenie. Współpracujemy z prawnikami wyspecjalizowanymi w zakresie {espName}. Czy chcą Państwo, abyśmy przydzielili prawnika do tej sprawy? Prosimy odpowiedzieć na tę wiadomość, aby potwierdzić.",
  },
  sv: {
    serviceNotOffered: "Vi beklagar att behöva meddela att vi för närvarande inte erbjuder den efterfrågade tjänsten. Vi ber om ursäkt för besväret.",
    consultaReviewedMoreInfo: "Vi har gått igenom din förfrågan och återkommer snart med mer information.",
    assignedSpecializedLawyer: "Perfekt, vi har tilldelat ditt ärende en specialiserad jurist. Du blir kontaktad inom kort.",
    futureNeedServices: "Förstått. Om du behöver våra tjänster i framtiden är du alltid välkommen att kontakta oss.",
    assignedSpecializedProfessional: "Vi har tilldelat ditt ärende en specialiserad expert. Du blir kontaktad inom kort.",
    couldNotAssignRightNow: "Vi har inte kunnat tilldela ditt ärende just nu. Vi kontaktar dig så snart som möjligt.",
    requestUnderReview: "Vi har tagit emot din förfrågan. Vi granskar den och återkommer snart.",
    assignmentAskEmail: "Vi har tagit emot din förfrågan. Vi har jurister som är specialiserade på {espName}. Vill du att vi tilldelar en jurist till ditt ärende? Svara på det här mejlet för att bekräfta.",
    assignmentAskWhatsApp: "Vi har tagit emot din förfrågan. Vi har jurister som är specialiserade på {espName}. Vill du att vi tilldelar en jurist till ditt ärende? Svara på det här meddelandet för att bekräfta.",
  },
  no: {
    serviceNotOffered: "Vi beklager å måtte informere deg om at vi for øyeblikket ikke tilbyr den forespurte tjenesten. Vi beklager ulempene.",
    consultaReviewedMoreInfo: "Vi har gjennomgått henvendelsen din og vil kontakte deg snart med mer informasjon.",
    assignedSpecializedLawyer: "Flott, vi har tildelt saken din en spesialisert advokat. Du vil bli kontaktet snart.",
    futureNeedServices: "Forstått. Hvis du trenger tjenestene våre i fremtiden, er du velkommen til å kontakte oss.",
    assignedSpecializedProfessional: "Vi har tildelt saken din til en spesialisert fagperson. Du vil bli kontaktet snart.",
    couldNotAssignRightNow: "Vi har ikke kunnet tildele saken din akkurat nå. Vi kontakter deg så snart som mulig.",
    requestUnderReview: "Vi har mottatt forespørselen din. Vi gjennomgår den og kommer tilbake til deg snart.",
    assignmentAskEmail: "Vi har mottatt forespørselen din. Vi har advokater som er spesialiserte innen {espName}. Ønsker du at vi skal tildele en advokat til saken din? Svar på denne e-posten for å bekrefte.",
    assignmentAskWhatsApp: "Vi har mottatt forespørselen din. Vi har advokater som er spesialiserte innen {espName}. Ønsker du at vi skal tildele en advokat til saken din? Svar på denne meldingen for å bekrefte.",
  },
  da: {
    serviceNotOffered: "Vi beklager at måtte oplyse, at vi i øjeblikket ikke tilbyder den ønskede tjeneste. Vi beklager ulejligheden.",
    consultaReviewedMoreInfo: "Vi har gennemgået din henvendelse og vender snart tilbage med flere oplysninger.",
    assignedSpecializedLawyer: "Perfekt, vi har tildelt din sag en specialiseret advokat. Du vil blive kontaktet inden længe.",
    futureNeedServices: "Forstået. Hvis du får brug for vores tjenester i fremtiden, er du meget velkommen til at kontakte os.",
    assignedSpecializedProfessional: "Vi har tildelt din sag til en specialiseret fagperson. Du vil blive kontaktet inden længe.",
    couldNotAssignRightNow: "Vi har ikke kunnet tildele din sag på nuværende tidspunkt. Vi kontakter dig hurtigst muligt.",
    requestUnderReview: "Vi har modtaget din anmodning. Vi gennemgår den og vender snart tilbage.",
    assignmentAskEmail: "Vi har modtaget din henvendelse. Vi har advokater med speciale i {espName}. Ønsker du, at vi tildeler en advokat til din sag? Svar på denne email for at bekræfte.",
    assignmentAskWhatsApp: "Vi har modtaget din henvendelse. Vi har advokater med speciale i {espName}. Ønsker du, at vi tildeler en advokat til din sag? Svar på denne besked for at bekræfte.",
  },
  fi: {
    serviceNotOffered: "Pahoittelemme, mutta emme tällä hetkellä tarjoa pyydettyä palvelua. Pahoittelemme tästä aiheutuvaa haittaa.",
    consultaReviewedMoreInfo: "Olemme käyneet tiedustelusi läpi ja palaamme pian lisätietojen kanssa.",
    assignedSpecializedLawyer: "Hienoa, olemme osoittaneet asiallesi erikoistuneen lakimiehen. Hän ottaa sinuun pian yhteyttä.",
    futureNeedServices: "Ymmärretty. Jos tarvitsette palvelujamme tulevaisuudessa, ottakaa meihin rohkeasti yhteyttä.",
    assignedSpecializedProfessional: "Olemme osoittaneet asianne erikoistuneelle asiantuntijalle. Hän ottaa sinuun pian yhteyttä.",
    couldNotAssignRightNow: "Emme pystyneet tällä hetkellä osoittamaan asiaanne. Otamme teihin yhteyttä mahdollisimman pian.",
    requestUnderReview: "Olemme vastaanottaneet pyyntönne. Käsittelemme sitä ja palaamme pian asiaan.",
    assignmentAskEmail: "Olemme vastaanottaneet pyyntönne. Meillä on {espName}-alaan erikoistuneita lakimiehiä. Haluatteko, että osoitamme asianne hoitamiseen lakimiehen? Vastatkaa tähän sähköpostiin vahvistaaksenne.",
    assignmentAskWhatsApp: "Olemme vastaanottaneet pyyntönne. Meillä on {espName}-alaan erikoistuneita lakimiehiä. Haluatteko, että osoitamme asianne hoitamiseen lakimiehen? Vastatkaa tähän viestiin vahvistaaksenne.",
  },
  el: {
    serviceNotOffered: "Λυπούμαστε, αλλά προς το παρόν δεν προσφέρουμε τη ζητούμενη υπηρεσία. Ζητούμε συγγνώμη για την αναστάτωση.",
    consultaReviewedMoreInfo: "Έχουμε εξετάσει το αίτημά σας και θα επικοινωνήσουμε σύντομα μαζί σας με περισσότερες πληροφορίες.",
    assignedSpecializedLawyer: "Τέλεια, αναθέσαμε την υπόθεσή σας σε εξειδικευμένο δικηγόρο. Θα επικοινωνήσει σύντομα μαζί σας.",
    futureNeedServices: "Κατανοητό. Αν χρειαστείτε τις υπηρεσίες μας στο μέλλον, μη διστάσετε να επικοινωνήσετε μαζί μας.",
    assignedSpecializedProfessional: "Αναθέσαμε την υπόθεσή σας σε εξειδικευμένο επαγγελματία. Θα επικοινωνήσει σύντομα μαζί σας.",
    couldNotAssignRightNow: "Δεν μπορέσαμε να αναθέσουμε την υπόθεσή σας αυτή τη στιγμή. Θα επικοινωνήσουμε μαζί σας το συντομότερο δυνατό.",
    requestUnderReview: "Λάβαμε το αίτημά σας. Το εξετάζουμε και θα επικοινωνήσουμε σύντομα μαζί σας.",
    assignmentAskEmail: "Λάβαμε το αίτημά σας. Διαθέτουμε δικηγόρους με εξειδίκευση στο {espName}. Θα θέλατε να σας αναθέσουμε έναν δικηγόρο για την υπόθεσή σας; Απαντήστε σε αυτό το email για επιβεβαίωση.",
    assignmentAskWhatsApp: "Λάβαμε το αίτημά σας. Διαθέτουμε δικηγόρους με εξειδίκευση στο {espName}. Θα θέλατε να σας αναθέσουμε έναν δικηγόρο για την υπόθεσή σας; Απαντήστε σε αυτό το μήνυμα για επιβεβαίωση.",
  },
  cs: {
    serviceNotOffered: "Litujeme, ale v současné době nenabízíme požadovanou službu. Omlouváme se za nepříjemnosti.",
    consultaReviewedMoreInfo: "Vaši žádost jsme posoudili a brzy se vám ozveme s dalšími informacemi.",
    assignedSpecializedLawyer: "Výborně, vašemu případu jsme přidělili specializovaného právníka. Brzy vás bude kontaktovat.",
    futureNeedServices: "Rozumíme. Pokud budete naše služby v budoucnu potřebovat, neváhejte nás kontaktovat.",
    assignedSpecializedProfessional: "Váš případ jsme přidělili specializovanému odborníkovi. Brzy vás bude kontaktovat.",
    couldNotAssignRightNow: "V tuto chvíli se nám nepodařilo váš případ přidělit. Budeme vás co nejdříve kontaktovat.",
    requestUnderReview: "Vaši žádost jsme obdrželi. Prověřujeme ji a brzy se vám ozveme.",
    assignmentAskEmail: "Obdrželi jsme vaši žádost. Máme právníky specializované na oblast {espName}. Přejete si, abychom vašemu případu přidělili právníka? Potvrďte to odpovědí na tento email.",
    assignmentAskWhatsApp: "Obdrželi jsme vaši žádost. Máme právníky specializované na oblast {espName}. Přejete si, abychom vašemu případu přidělili právníka? Potvrďte to odpovědí na tuto zprávu.",
  },
  hu: {
    serviceNotOffered: "Sajnáljuk, de jelenleg nem kínáljuk a kért szolgáltatást. Elnézést kérünk a kellemetlenségért.",
    consultaReviewedMoreInfo: "Áttekintettük a megkeresését, és hamarosan további információkkal jelentkezünk.",
    assignedSpecializedLawyer: "Rendben, ügyéhez kijelöltünk egy szakterületen jártas ügyvédet. Hamarosan felveszi Önnel a kapcsolatot.",
    futureNeedServices: "Értjük. Ha a jövőben szüksége lesz szolgáltatásainkra, forduljon hozzánk bizalommal.",
    assignedSpecializedProfessional: "Az ügyét egy szakterületen jártas szakemberhez rendeltük. Hamarosan felveszi Önnel a kapcsolatot.",
    couldNotAssignRightNow: "Jelenleg nem tudtuk kiosztani az ügyét. A lehető leghamarabb felvesszük Önnel a kapcsolatot.",
    requestUnderReview: "Megkaptuk a kérését. Jelenleg vizsgáljuk, és hamarosan válaszolunk.",
    assignmentAskEmail: "Megkaptuk a megkeresését. Rendelkezünk {espName} területére szakosodott ügyvédekkel. Szeretné, hogy kijelöljünk egy ügyvédet az ügyéhez? A megerősítéshez válaszoljon erre az emailre.",
    assignmentAskWhatsApp: "Megkaptuk a megkeresését. Rendelkezünk {espName} területére szakosodott ügyvédekkel. Szeretné, hogy kijelöljünk egy ügyvédet az ügyéhez? A megerősítéshez válaszoljon erre az üzenetre.",
  },
  ro: {
    serviceNotOffered: "Ne pare rău să vă informăm că în prezent nu oferim serviciul solicitat. Ne cerem scuze pentru inconvenient.",
    consultaReviewedMoreInfo: "Am analizat solicitarea dumneavoastră și vom reveni în scurt timp cu mai multe informații.",
    assignedSpecializedLawyer: "Perfect, am alocat cazului dumneavoastră un avocat specializat. Acesta vă va contacta în scurt timp.",
    futureNeedServices: "Înțeles. Dacă veți avea nevoie de serviciile noastre în viitor, nu ezitați să ne contactați.",
    assignedSpecializedProfessional: "Am alocat cazul dumneavoastră unui specialist. Acesta vă va contacta în scurt timp.",
    couldNotAssignRightNow: "În acest moment nu am reușit să alocăm cazul dumneavoastră. Vă vom contacta cât mai curând posibil.",
    requestUnderReview: "Am primit solicitarea dumneavoastră. O analizăm și vom reveni în scurt timp.",
    assignmentAskEmail: "Am primit solicitarea dumneavoastră. Avem avocați specializați în {espName}. Doriți să vă alocăm un avocat pentru cazul dumneavoastră? Răspundeți la acest email pentru confirmare.",
    assignmentAskWhatsApp: "Am primit solicitarea dumneavoastră. Avem avocați specializați în {espName}. Doriți să vă alocăm un avocat pentru cazul dumneavoastră? Răspundeți la acest mesaj pentru confirmare.",
  },
  bg: {
    serviceNotOffered: "Съжаляваме да ви уведомим, че в момента не предлагаме поисканата услуга. Извиняваме се за неудобството.",
    consultaReviewedMoreInfo: "Разгледахме запитването ви и скоро ще се свържем с вас с повече информация.",
    assignedSpecializedLawyer: "Чудесно, назначихме на случая ви специализиран адвокат. Той ще се свърже с вас скоро.",
    futureNeedServices: "Разбираме. Ако в бъдеще имате нужда от нашите услуги, не се колебайте да се свържете с нас.",
    assignedSpecializedProfessional: "Назначихме случая ви на специализиран специалист. Той ще се свърже с вас скоро.",
    couldNotAssignRightNow: "В момента не успяхме да разпределим случая ви. Ще се свържем с вас възможно най-скоро.",
    requestUnderReview: "Получихме вашето запитване. Разглеждаме го и скоро ще ви отговорим.",
    assignmentAskEmail: "Получихме вашето запитване. Разполагаме с адвокати, специализирани в областта {espName}. Желаете ли да ви назначим адвокат за вашия случай? Отговорете на този имейл, за да потвърдите.",
    assignmentAskWhatsApp: "Получихме вашето запитване. Разполагаме с адвокати, специализирани в областта {espName}. Желаете ли да ви назначим адвокат за вашия случай? Отговорете на това съобщение, за да потвърдите.",
  },
  hr: {
    serviceNotOffered: "Žao nam je, ali trenutačno ne nudimo traženu uslugu. Ispričavamo se zbog neugodnosti.",
    consultaReviewedMoreInfo: "Pregledali smo vaš upit i uskoro ćemo vam odgovoriti s više informacija.",
    assignedSpecializedLawyer: "U redu, vašem slučaju dodijelili smo specijaliziranog odvjetnika. Uskoro će vas kontaktirati.",
    futureNeedServices: "Razumijemo. Ako vam u budućnosti zatrebaju naše usluge, slobodno nam se obratite.",
    assignedSpecializedProfessional: "Vaš slučaj dodijelili smo specijaliziranom stručnjaku. Uskoro će vas kontaktirati.",
    couldNotAssignRightNow: "Trenutačno nismo uspjeli dodijeliti vaš slučaj. Kontaktirat ćemo vas što je prije moguće.",
    requestUnderReview: "Zaprimili smo vaš zahtjev. Pregledavamo ga i uskoro ćemo vam odgovoriti.",
    assignmentAskEmail: "Zaprimili smo vaš zahtjev. Imamo odvjetnike specijalizirane za {espName}. Želite li da vam dodijelimo odvjetnika za vaš slučaj? Odgovorite na ovaj email kako biste potvrdili.",
    assignmentAskWhatsApp: "Zaprimili smo vaš zahtjev. Imamo odvjetnike specijalizirane za {espName}. Želite li da vam dodijelimo odvjetnika za vaš slučaj? Odgovorite na ovu poruku kako biste potvrdili.",
  },
  sk: {
    serviceNotOffered: "Je nám ľúto, ale v súčasnosti neponúkame požadovanú službu. Ospravedlňujeme sa za nepríjemnosti.",
    consultaReviewedMoreInfo: "Preskúmali sme vašu požiadavku a čoskoro sa vám ozveme s ďalšími informáciami.",
    assignedSpecializedLawyer: "Výborne, vášmu prípadu sme pridelili špecializovaného advokáta. Čoskoro vás bude kontaktovať.",
    futureNeedServices: "Rozumieme. Ak budete v budúcnosti potrebovať naše služby, neváhajte nás kontaktovať.",
    assignedSpecializedProfessional: "Váš prípad sme pridelili špecializovanému odborníkovi. Čoskoro vás bude kontaktovať.",
    couldNotAssignRightNow: "V tejto chvíli sa nám nepodarilo prideliť váš prípad. Budeme vás kontaktovať čo najskôr.",
    requestUnderReview: "Vašu žiadosť sme prijali. Posudzujeme ju a čoskoro sa vám ozveme.",
    assignmentAskEmail: "Prijali sme vašu žiadosť. Máme advokátov špecializovaných na oblasť {espName}. Želáte si, aby sme vášmu prípadu pridelili advokáta? Potvrďte to odpoveďou na tento email.",
    assignmentAskWhatsApp: "Prijali sme vašu žiadosť. Máme advokátov špecializovaných na oblasť {espName}. Želáte si, aby sme vášmu prípadu pridelili advokáta? Potvrďte to odpoveďou na túto správu.",
  },
  sl: {
    serviceNotOffered: "Žal nam je, vendar trenutno ne ponujamo zahtevane storitve. Opravičujemo se za nevšečnosti.",
    consultaReviewedMoreInfo: "Pregledali smo vaše povpraševanje in vam bomo kmalu odgovorili z dodatnimi informacijami.",
    assignedSpecializedLawyer: "Odlično, vašemu primeru smo dodelili specializiranega odvetnika. Kmalu vas bo kontaktiral.",
    futureNeedServices: "Razumemo. Če boste v prihodnje potrebovali naše storitve, nas brez zadržkov kontaktirajte.",
    assignedSpecializedProfessional: "Vaš primer smo dodelili specializiranemu strokovnjaku. Kmalu vas bo kontaktiral.",
    couldNotAssignRightNow: "Vašega primera trenutno nismo mogli dodeliti. Kontaktirali vas bomo čim prej.",
    requestUnderReview: "Prejeli smo vašo zahtevo. Pregledujemo jo in vam bomo kmalu odgovorili.",
    assignmentAskEmail: "Prejeli smo vašo zahtevo. Imamo odvetnike, specializirane za področje {espName}. Ali želite, da vašemu primeru dodelimo odvetnika? Za potrditev odgovorite na ta email.",
    assignmentAskWhatsApp: "Prejeli smo vašo zahtevo. Imamo odvetnike, specializirane za področje {espName}. Ali želite, da vašemu primeru dodelimo odvetnika? Za potrditev odgovorite na to sporočilo.",
  },
  lt: {
    serviceNotOffered: "Deja, šiuo metu neteikiame prašomos paslaugos. Atsiprašome už nepatogumus.",
    consultaReviewedMoreInfo: "Peržiūrėjome jūsų užklausą ir netrukus pateiksime daugiau informacijos.",
    assignedSpecializedLawyer: "Puiku, jūsų bylai paskyrėme specializuotą advokatą. Jis netrukus su jumis susisieks.",
    futureNeedServices: "Supratome. Jei ateityje prireiktų mūsų paslaugų, nedvejodami susisiekite su mumis.",
    assignedSpecializedProfessional: "Jūsų bylą priskyrėme specializuotam specialistui. Jis netrukus su jumis susisieks.",
    couldNotAssignRightNow: "Šiuo metu negalėjome priskirti jūsų bylos. Susisieksime su jumis kuo greičiau.",
    requestUnderReview: "Gavome jūsų užklausą. Šiuo metu ją peržiūrime ir netrukus atsakysime.",
    assignmentAskEmail: "Gavome jūsų užklausą. Turime advokatų, besispecializuojančių {espName} srityje. Ar norėtumėte, kad jūsų bylai paskirtume advokatą? Atsakykite į šį el. laišką, kad patvirtintumėte.",
    assignmentAskWhatsApp: "Gavome jūsų užklausą. Turime advokatų, besispecializuojančių {espName} srityje. Ar norėtumėte, kad jūsų bylai paskirtume advokatą? Atsakykite į šią žinutę, kad patvirtintumėte.",
  },
  lv: {
    serviceNotOffered: "Diemžēl pašlaik mēs nepiedāvājam pieprasīto pakalpojumu. Atvainojamies par sagādātajām neērtībām.",
    consultaReviewedMoreInfo: "Esam izskatījuši jūsu pieprasījumu un drīzumā sniegsim vairāk informācijas.",
    assignedSpecializedLawyer: "Lieliski, jūsu lietai esam piešķīruši specializētu juristu. Viņš drīz ar jums sazināsies.",
    futureNeedServices: "Saprotam. Ja jums nākotnē būs nepieciešami mūsu pakalpojumi, droši sazinieties ar mums.",
    assignedSpecializedProfessional: "Jūsu lietu esam piešķīruši specializētam speciālistam. Viņš drīz ar jums sazināsies.",
    couldNotAssignRightNow: "Pašlaik mums nav izdevies piešķirt jūsu lietu. Mēs ar jums sazināsimies pēc iespējas ātrāk.",
    requestUnderReview: "Esam saņēmuši jūsu pieprasījumu. Pašlaik to izskatām un drīzumā atbildēsim.",
    assignmentAskEmail: "Esam saņēmuši jūsu pieprasījumu. Mums ir juristi, kas specializējas {espName}. Vai vēlaties, lai mēs jūsu lietai piešķiram juristu? Atbildiet uz šo e-pastu, lai apstiprinātu.",
    assignmentAskWhatsApp: "Esam saņēmuši jūsu pieprasījumu. Mums ir juristi, kas specializējas {espName}. Vai vēlaties, lai mēs jūsu lietai piešķiram juristu? Atbildiet uz šo ziņu, lai apstiprinātu.",
  },
  et: {
    serviceNotOffered: "Kahjuks ei paku me praegu soovitud teenust. Vabandame ebamugavuste pärast.",
    consultaReviewedMoreInfo: "Oleme teie päringu läbi vaadanud ja vastame peagi lisateabega.",
    assignedSpecializedLawyer: "Suurepärane, oleme teie juhtumile määranud spetsialiseerunud juristi. Ta võtab teiega peagi ühendust.",
    futureNeedServices: "Mõistame. Kui vajate tulevikus meie teenuseid, võtke meiega julgelt ühendust.",
    assignedSpecializedProfessional: "Oleme teie juhtumi määranud spetsialiseerunud spetsialistile. Ta võtab teiega peagi ühendust.",
    couldNotAssignRightNow: "Meil ei olnud võimalik teie juhtumit praegu suunata. Võtame teiega esimesel võimalusel ühendust.",
    requestUnderReview: "Oleme teie päringu kätte saanud. Vaatame selle üle ja vastame peagi.",
    assignmentAskEmail: "Oleme teie päringu kätte saanud. Meil on {espName} valdkonnale spetsialiseerunud juriste. Kas soovite, et määraksime teie juhtumile juristi? Kinnitamiseks vastake sellele e-kirjale.",
    assignmentAskWhatsApp: "Oleme teie päringu kätte saanud. Meil on {espName} valdkonnale spetsialiseerunud juriste. Kas soovite, et määraksime teie juhtumile juristi? Kinnitamiseks vastake sellele sõnumile.",
  },
};

let _ai: OpenAI | null = null;
const detectionCache = new Map<string, SupportedAutomationLanguage>();

function getAI(): OpenAI {
  if (!_ai) {
    _ai = new OpenAI({
      apiKey: process.env.ATLAS_API_KEY,
      baseURL: 'https://api.atlascloud.ai/v1',
    });
  }
  return _ai;
}

function normalizeLanguage(value: string | null | undefined): SupportedAutomationLanguage | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  return SUPPORTED_AUTOMATION_LANGUAGES.includes(normalized as SupportedAutomationLanguage)
    ? normalized as SupportedAutomationLanguage
    : null;
}

function buildSample(textSamples: Array<string | undefined>): string {
  return textSamples
    .map((sample) => String(sample || '').trim())
    .filter(Boolean)
    .join('\n\n')
    .slice(0, 2400);
}

function interpolate(template: string, variables: MessageVariables = {}): string {
  return template.replace(/\{(\w+)\}/g, (_match, key) => String(variables[key as keyof MessageVariables] || ''));
}

async function detectSupportedAutomationLanguage(sample: string): Promise<SupportedAutomationLanguage | null> {
  const trimmed = sample.trim();
  if (!trimmed) return null;

  const cacheKey = trimmed.slice(0, 800).toLowerCase();
  const cached = detectionCache.get(cacheKey);
  if (cached) return cached;

  try {
    const completion = await getAI().chat.completions.create({
      model: AI_AUTOMATION_MODEL,
      temperature: 0,
      max_tokens: 8,
      messages: [
        {
          role: 'system',
          content: `Identify the dominant language of the client's text. Reply with only one supported language code and nothing else: ${SUPPORTED_AUTOMATION_LANGUAGES.join(', ')}. If the text is mixed or ambiguous, choose the closest supported language.`,
        },
        { role: 'user', content: trimmed },
      ],
    });
    const raw = stripThinkTags(completion.choices[0]?.message?.content || '');
    const match = raw.match(LANGUAGE_CODE_PATTERN);
    const detected = normalizeLanguage(match?.[1] || raw);
    if (detected) {
      detectionCache.set(cacheKey, detected);
      return detected;
    }
  } catch (err) {
    console.warn('[automationMessages] No se pudo detectar el idioma del cliente:', err);
  }

  return null;
}

export function getLanguageForCountry(countryCode: string | null | undefined): SupportedAutomationLanguage {
  return COUNTRY_LANGUAGE_MAP[String(countryCode || '').toUpperCase()] || 'es';
}

export async function resolveAutomationLanguage(
  accountId: string,
  ...textSamples: Array<string | undefined>
): Promise<SupportedAutomationLanguage> {
  const sample = buildSample(textSamples);
  const detected = await detectSupportedAutomationLanguage(sample);
  if (detected) return detected;

  try {
    const account = await Account.findById(accountId).select('country').lean();
    return getLanguageForCountry((account as { country?: string } | null)?.country);
  } catch (err) {
    console.warn('[automationMessages] No se pudo resolver el país de la cuenta para el fallback de idioma:', err);
    return 'es';
  }
}

export function getAutomationMessage(
  language: SupportedAutomationLanguage,
  key: AutomationMessageKey,
  variables: MessageVariables = {},
): string {
  const template = AUTOMATION_MESSAGES[language]?.[key] || AUTOMATION_MESSAGES.es[key];
  return interpolate(template, variables);
}