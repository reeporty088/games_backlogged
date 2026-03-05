// Selecionando os elementos HTML que vamos manipular
const btnAddGame = document.getElementById('btn-add-game');
const modalOverlay = document.getElementById('modal-novo-jogo');
const btnCloseModal = document.getElementById('btn-close-modal');
const btnCancelar = document.getElementById('btn-cancelar');
const formJogo = document.getElementById('form-jogo');

// Função para abrir o modal
function openModal() {
    modalOverlay.classList.add('active');
}

// Função para fechar o modal
function closeModal() {
    modalOverlay.classList.remove('active');
    formJogo.reset(); // Limpa os campos quando fecha
}

// Ouvintes de eventos (Cliques)
btnAddGame.addEventListener('click', openModal);
btnCloseModal.addEventListener('click', closeModal);
btnCancelar.addEventListener('click', closeModal);

// Fechar clicando fora da caixa do modal
modalOverlay.addEventListener('click', (e) => {
    if (e.target === modalOverlay) {
        closeModal();
    }
});

// Evitar que a página recarregue ao "salvar"
formJogo.addEventListener('submit', (e) => {
    e.preventDefault();
    
    // Aqui pegaremos os valores do formulário para enviar ao Firebase no futuro
    console.log("Botão de salvar clicado! Integração com Firebase virá a seguir.");
    
    // Fecha o modal após "salvar"
    closeModal();
});
