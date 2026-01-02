import { habitScheduler } from "@/services/habitScheduler";

function Home() {
	habitScheduler.initialize().catch(console.error);
	return <div>Backend is running</div>;
}

export default Home;
