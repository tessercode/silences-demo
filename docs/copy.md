# Copy review sheet

Every piece of explanatory text the page shows, in page order, with where it lives. Reply with item
numbers and new wording (for example "C7: ..."); they are applied in the source and this sheet is
updated to match. Text in `${...}` is filled in at run time. Short labels (axis titles, tooltips,
legend entries) are not listed; say if you want those too.

Status: **not yet reviewed** (2026-10-30).

## Page header and settings

**C1** (index.html, `.lede`)
> Type a message, choose how the operator keys it, and follow it through the TEMPO decoding chain: an
> encoder that turns each Morse mark into a spike on a dot or dash line, a front end that timestamps
> the spikes, a trained network that decides what each silence between marks means, and a beam search
> with a character language model that turns those decisions into text. Everything runs in your
> browser, using the same code and fixed-point arithmetic as the five-board RP2040 decoder in the paper.

**C2** (index.html, text box label) Text to send (letters, digits and spaces)

**C3** (main.ts `checkLength`, under the text box) `${n} of 256 marks` · when over:
> `${n}` marks: the front end's frame holds 256. Shorten the text to decode it.

**C4** (index.html, seed note)
> The seed fixes the operator's random timing, so a seed always reproduces the same transmission.

**C5** (index.html, fist label) Operator fist (synthetic sending style)

**C6** (main.ts `settings`, fist card)
> `${wpm}` WPM · dash/dot ratio `${r}` · element jitter `${σ_elem}` T_u · gap jitter `${σ_gap}` T_u ·
> word-speed drift ω `${ω}`

**C7** (index.html, decoder-weights options)
> Fitted per segmenter, English words · Fitted per segmenter, random letters · Deployed on the RP2040
> (T = 1, γ = 2.5) · Custom

**C8** (main.ts `settings`, weights note, fitted)
> Each segmenter decodes at its own (T, γ), fitted on a calibration corpus of this text type: LIF
> (1.5, 4), MLP (1.5, 4), BIGRU (1.5, 2). Typed text is neither of the fitted text types; the oracle
> always uses the deployed weights.

**C9** (main.ts, weights note, deployed)
> The one setting the RP2040 decode board uses for every segmenter.

**C10** (main.ts, weights note, custom)
> T scales the segmenter's log-posteriors; γ is the bonus added for every letter. Raising T with γ
> fixed turns the language model down.

**C11** (worker.ts, loading messages)
> Step 1 of 3: loading Python (Pyodide, about 14 MB on a first visit)… · Step 2 of 3: loading numpy
> (3 MB)… · Step 3 of 3: loading the trained segmenters and language model… · Decoding…

## 2 Encoder

**C12** (index.html, `#p-encoder .explain`)
> The operator keys each letter as dots and dashes. A mark is a **dot** if it is held for less than
> 1.92 time units (T_u) and a **dash** otherwise; when a mark ends, a 1 ms spike fires on the dot line
> or the dash line. The fist adds timing jitter and lets each word drift faster or slower. Grey ticks
> show where each mark would end with perfect timing; the thin lines show how far the fist moved it.
> A red ring marks a channel error: a mark held so far off that it lands on the wrong line.

**C13** (encoder.ts, spike tooltip on a channel error)
> intended a `${dash|dot}`: the mark was held `${shorter|longer}` than 1.92 T_u, so it lands on the
> wrong line

## 3 Front end

**C14** (main.ts, subtitle)
> T̂u = `${ms}` ms (the fist's nominal T_u is `${ms}` ms; words drift around it)

**C15** (index.html, `#p-frontend .explain`)
> The front end sees only when each spike arrived and on which line. It estimates the time unit T̂u
> from the shortest intervals and measures each **interval** (a silence plus the mark after it) in
> those units. Every point is one gap, coloured by what it really is; the lines mark the nominal
> intervals at the fist's base speed, 2, 4, 6, 8 and 10 T_u, converted into T̂u units. 4 is
> ambiguous: a 1 T_u silence before a dash (● circle = next mark is a dot, ■ square = a dash) looks
> exactly like a 3 T_u silence before a dot. Jitter and drift blur everything else. Click a gap to
> follow it through the rest of the chain.

## 4 What the segmenter reads

**C16** (main.ts, LIF and MLP)
> The LIF and MLP classify each gap from a window of the 10 gaps before it, the gap itself and the 10
> after: the log of each interval in T̂u and the channel bit of the mark that ends it, standardised.
> The bit is what separates the two readings of a 4 T_u interval. Pick another gap in step 3 or 5 to
> move the window.

**C17** (main.ts, BiGRU)
> The BiGRU reads nine features per gap: six decaying traces of the interval (a population of leaky
> integrators at different rates), the next mark's channel bit, and two soft thresholds. It reads them
> in order, forwards and backwards, so it sees the whole transmission in both directions, which is why
> it cannot stream and cannot run on SpiNNaker.

**C18** (main.ts, hand-off labels) 42 standardised inputs per gap · 9 features per gap, the whole sequence

## 5 Gap segmenter

**C19** (main.ts `segExplain`)
> Each bar is one gap's three posteriors, stacked to 100%; the strip beneath shows the true class.
> Click a gap to see it inside the network.

**C20** (main.ts `segExplain`, oracle)
> … The oracle is not a network: it gives the true class almost all the probability, so the decoder's
> remaining errors come from channel errors (a dot sent as a dash) that no gap segmenter can fix.

**C21** (main.ts, compare mode)
> Each row is one segmenter's posteriors for every gap of the same transmission. Click a row in the
> result table to open that segmenter.

**C22** (main.ts `renderTrace`, LIF)
> The 42 inputs drive the first layer as a constant current for 40 time steps. Each neuron's membrane
> leaks by β each step, and when it crosses the threshold the neuron spikes and the threshold is
> subtracted. Spikes are the only thing the layers pass on. Each dot below is one spike (one row per
> neuron); the readout neurons do not spike, and the mean of their membranes is the three logits.

**C23** (segmenter.ts, under the readout plot)
> dashed: mean over the steps = the class logit · β = 0.95, threshold 1, subtractive reset, T = 40

**C24** (main.ts, MLP)
> The control network: the same inputs and layer sizes as the LIF (256 and 128 units), with tanh units
> in place of spiking neurons and one pass instead of 40 time steps.

**C25** (main.ts, BiGRU)
> Hidden states of the two GRU directions after each gap. The forward pass carries what came before,
> the reverse pass what comes after; the classifier reads both. The deployed segmenter averages five
> such networks.

**C26** (main.ts, hand-off) 0x03 frame: `${n}` rows of three log-posteriors (Q16.16 fixed point)

## 6 Beam decoder

**C27** (index.html, `#p-decoder .explain`)
> The decoder walks the gaps left to right, keeping the 20 best readings. At each gap a reading may
> extend the letter in progress (if the longer pattern can still be a letter) or close it as a letter
> or a word (if it is a complete letter). Closing a letter adds a character language model's
> log-probability and an insertion bonus γ; the segmenter's log-posteriors are scaled by T. Each column
> shows the best readings after one gap (text so far, then the letter in progress, and the score
> behind the best); the framed cell is the reading that won. The coloured bar under each gap shows the
> class the winning reading chose.

**C28** (decoder.ts, beam died)
> No hypothesis survived: the beam died. The decoder outputs nothing for this transmission.

## 7 Result

**C29** (output.ts, under the result when the weights are not deployed)
> At the deployed decoder weights (T = 1, γ = 2.5) this would read: `${text}`

## Footer

**C30** (about.ts)
> Numbers here are for one sentence; the paper's results are averaged over thousands of transmissions
> and ten training seeds. Everything runs in your browser: nothing you type is sent anywhere.

**C31** (about.ts, citations) Paper: authors, title, "submitted" until a DOI exists · Code and models:
the silences release (Zenodo DOI once minted), pinned commit, "run unchanged under Pyodide" · Benchmark:
the TEMPO paper with its DOI.
